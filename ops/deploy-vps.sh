#!/usr/bin/env bash
set -euo pipefail
umask 077

root=/opt/da-nmcnpm
project=da-nmcnpm
environment="$root/deploy.env"
live_compose="$root/compose.production.yaml"
live_db="$root/data/app.db"

prepare_only=false
if [[ -n ${SSH_ORIGINAL_COMMAND+x} ]]; then
  revision=${SSH_ORIGINAL_COMMAND#deploy }
  [[ "$SSH_ORIGINAL_COMMAND" == "deploy $revision" ]] || exit 64
elif [[ $# -eq 2 && "$1" == --prepare-only ]]; then
  prepare_only=true
  revision=$2
else
  printf 'Expected an SSH deploy command or --prepare-only <revision>\n' >&2
  exit 64
fi
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || exit 64

test -r "$environment" && test -r "$live_compose" && test -r "$live_db"
mkdir -p "$root/releases" "$root/backups"
exec 9>"$root/.deploy.lock"
flock -w 300 9

release="$root/releases/$revision"
work=$(mktemp -d "$root/releases/.prepare.XXXXXX")
preview_active=false
preview_compose=()
# shellcheck disable=SC2317
cleanup() {
  if "$preview_active"; then
    RELEASE_TAG="$revision" "${preview_compose[@]}" down || return
  fi
  rm -rf -- "$work"
}
trap cleanup EXIT

cat > "$work/source.tar.gz"
mkdir "$work/source"
python3 - "$work/source.tar.gz" "$work/source" "$revision" <<'PY'
import sys
import tarfile
from pathlib import Path

archive_name, destination, revision = sys.argv[1:]
with tarfile.open(archive_name, "r:gz") as archive:
    archive.getmembers()
    if archive.pax_headers.get("comment") != revision:
        raise SystemExit("Git archive does not match the requested revision")
    archive.extractall(destination, filter="data")

root = Path(destination)
for name in ("Dockerfile", "compose.production.yaml", "package-lock.json"):
    if not (root / name).is_file():
        raise SystemExit(f"Release is missing {name}")
PY
if [[ ! -d "$release" ]]; then
  mv -- "$work/source" "$release"
fi

image="da-nmcnpm:$revision"
if ! docker image inspect "$image" >/dev/null 2>&1; then
  docker build --tag "$image" "$release"
fi

snapshot_database() {
  python3 - "$live_db" "$1" <<'PY'
import sqlite3
import sys
from pathlib import Path

source, destination = map(Path, sys.argv[1:])
with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True, timeout=10) as src:
    with sqlite3.connect(destination, timeout=10) as dst:
        src.backup(dst)
        if dst.execute("PRAGMA integrity_check").fetchone() != ("ok",):
            raise SystemExit("SQLite backup failed integrity check")
PY
}

mkdir "$work/data"
snapshot_database "$work/data/app.db"
cat > "$work/preview.yaml" <<YAML
services:
  app:
    ports: !reset []
    volumes:
      - "$work/data:/data"
networks:
  default:
    external: true
    name: ${project}_default
YAML
compose=(docker compose --project-directory "$root" --env-file "$environment")
preview_compose=("${compose[@]}" -p "$project-preview" -f "$release/compose.production.yaml" -f "$work/preview.yaml")
preview_active=true
RELEASE_TAG="$revision" "${preview_compose[@]}" up -d --no-build --wait --wait-timeout 90 app
RELEASE_TAG="$revision" "${preview_compose[@]}" down
preview_active=false
printf 'Preview passed for %s\n' "$revision"
if "$prepare_only"; then exit 0; fi

old_tag=$(sed -n 's/^RELEASE_TAG=//p' "$environment")
public_url=$(sed -n 's/^PUBLIC_URL=//p' "$environment")
[[ "$old_tag" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*$ && "$public_url" == https://* ]]
running_image=$(docker inspect "$project-app-1" --format '{{.Config.Image}}')
[[ "$running_image" == "$image" || "$running_image" == "da-nmcnpm:$old_tag" ]]

install -m 0644 "$release/compose.production.yaml" "$work/compose.production.yaml"
awk -v tag="$revision" '
  /^RELEASE_TAG=/ { $0 = "RELEASE_TAG=" tag }
  { print }
' "$environment" > "$work/deploy.env"

backup="$root/backups/$(date -u +%Y%m%dT%H%M%SZ)-$revision.sqlite"
snapshot_database "$backup"
printf 'Pre-deployment SQLite backup: %s\n' "$backup"

new_compose=("${compose[@]}" -p "$project" -f "$release/compose.production.yaml")
if RELEASE_TAG="$revision" "${new_compose[@]}" up -d --no-build --wait --wait-timeout 90 app &&
   curl --fail --silent --show-error --retry 2 --max-time 8 --output /dev/null "$public_url/login"; then
  mv -f -- "$work/compose.production.yaml" "$live_compose"
  mv -f -- "$work/deploy.env" "$environment"
  printf 'Production ready at %s (%s)\n' "$public_url" "$revision"
  exit 0
fi

RELEASE_TAG="$revision" "${new_compose[@]}" logs --tail 60 app >&2 || true
if python3 - "$backup" "$live_db" <<'PY'
import sqlite3
import sys
from pathlib import Path

def migrations(path):
    with sqlite3.connect(Path(path).as_uri() + "?mode=ro", uri=True) as db:
        return db.execute(
            "SELECT id, migration_name, checksum, finished_at, rolled_back_at "
            "FROM _prisma_migrations ORDER BY id"
        ).fetchall()

raise SystemExit(0 if migrations(sys.argv[1]) == migrations(sys.argv[2]) else 1)
PY
then
  RELEASE_TAG="$old_tag" "${compose[@]}" -p "$project" -f "$live_compose" \
    up -d --no-build --wait --wait-timeout 90 app
  printf 'Restored the previous application image: %s\n' "$old_tag" >&2
else
  printf 'The database migration state changed. Investigate using %s and %s\n' "$backup" "$release" >&2
fi
exit 1

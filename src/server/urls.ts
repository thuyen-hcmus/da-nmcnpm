import { env } from "./env";

export function joinUrl(code: string) {
  return `${env().PUBLIC_URL}/join/${code}`;
}

/** Token máy chiếu nằm sau dấu # để không đi vào log server / Referer. */
export function projectorUrl(code: string, projectorToken: string) {
  return `${env().PUBLIC_URL}/projector/${code}#t=${encodeURIComponent(projectorToken)}`;
}

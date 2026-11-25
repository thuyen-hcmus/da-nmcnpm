import { db } from "@/server/db";
import { json, requireLecturer, route } from "@/server/http";
import { loadSessionView, toLecturerState } from "@/server/projections";
import { AppError } from "@/shared/errors";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const u = await requireLecturer();
  const s = await db.session.findUnique({ where: { id }, select: { ownerId: true } });
  if (!s) throw new AppError("NOT_FOUND");
  if (s.ownerId !== u.id) throw new AppError("FORBIDDEN");
  const view = await loadSessionView(id);
  return json(await toLecturerState(view!));
});

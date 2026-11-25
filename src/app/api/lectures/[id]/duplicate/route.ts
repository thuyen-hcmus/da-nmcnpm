import { json, requireLecturer, route } from "@/server/http";
import { duplicateLecture } from "@/server/services/lecture-service";

export const POST = route<{ id: string }>(async (_req, { id }) => {
  const u = await requireLecturer();
  const l = await duplicateLecture(u.id, id);
  return json({ id: l.id, title: l.title }, 201);
});

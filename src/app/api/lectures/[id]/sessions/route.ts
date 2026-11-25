import { json, requireLecturer, route } from "@/server/http";
import { createSession } from "@/server/services/session-service";

export const POST = route<{ id: string }>(async (_req, { id }) => {
  const u = await requireLecturer();
  const r = await createSession(u.id, id);
  return json(
    { session: { id: r.session.id, code: r.session.code }, joinUrl: r.joinUrl, projectorUrl: r.projectorUrl },
    201,
  );
});

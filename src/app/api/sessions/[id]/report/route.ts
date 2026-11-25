import { json, requireLecturer, route } from "@/server/http";
import { sessionReport } from "@/server/services/report-service";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const u = await requireLecturer();
  return json(await sessionReport(u.id, id));
});

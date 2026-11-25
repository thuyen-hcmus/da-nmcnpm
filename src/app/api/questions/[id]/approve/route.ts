import { json, requireLecturer, route } from "@/server/http";
import { approveQuestion } from "@/server/services/question-service";

export const POST = route<{ id: string }>(async (_req, { id }) => {
  const u = await requireLecturer();
  return json(await approveQuestion(u.id, id));
});

import { json, parseBody, requireLecturer, route } from "@/server/http";
import { createQuestionForUser } from "@/server/services/question-service";
import { questionInput } from "@/shared/contracts";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const u = await requireLecturer();
  const input = await parseBody(req, questionInput);
  return json(await createQuestionForUser(u.id, id, input), 201);
});

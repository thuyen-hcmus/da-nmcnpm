import { json, parseBody, requireLecturer, route } from "@/server/http";
import { deleteQuestion, updateQuestion } from "@/server/services/question-service";
import { questionUpdateInput } from "@/shared/contracts";

type P = { id: string };

export const PATCH = route<P>(async (req, { id }) => {
  const u = await requireLecturer();
  const input = await parseBody(req, questionUpdateInput);
  return json(await updateQuestion(u.id, id, input));
});

export const DELETE = route<P>(async (_req, { id }) => {
  const u = await requireLecturer();
  await deleteQuestion(u.id, id);
  return new Response(null, { status: 204 });
});

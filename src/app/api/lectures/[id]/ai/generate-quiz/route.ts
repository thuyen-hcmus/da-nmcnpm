import { json, parseBody, requireLecturer, route } from "@/server/http";
import { generateQuiz } from "@/server/ai/ai-service";
import { aiGenerateQuizInput } from "@/shared/contracts";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const u = await requireLecturer();
  const input = await parseBody(req, aiGenerateQuizInput);
  return json({ questions: await generateQuiz(u.id, id, input) }, 201);
});

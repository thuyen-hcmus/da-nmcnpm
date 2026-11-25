import { json, parseBody, requireLecturer, route } from "@/server/http";
import { splitText } from "@/server/ai/ai-service";
import { aiSplitTextInput } from "@/shared/contracts";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const u = await requireLecturer();
  const input = await parseBody(req, aiSplitTextInput);
  return json({ slides: await splitText(u.id, id, input) }, 201);
});

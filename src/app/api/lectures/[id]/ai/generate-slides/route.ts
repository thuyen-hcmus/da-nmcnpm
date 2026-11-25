import { json, parseBody, requireLecturer, route } from "@/server/http";
import { generateSlides } from "@/server/ai/ai-service";
import { aiGenerateSlidesInput } from "@/shared/contracts";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const u = await requireLecturer();
  const input = await parseBody(req, aiGenerateSlidesInput);
  return json({ slides: await generateSlides(u.id, id, input) }, 201);
});

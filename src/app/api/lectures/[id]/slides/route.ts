import { json, parseBody, requireLecturer, route } from "@/server/http";
import { insertSlides, ownedLecture } from "@/server/services/lecture-service";
import { slideCreateInput } from "@/shared/contracts";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const u = await requireLecturer();
  await ownedLecture(u.id, id);
  const input = await parseBody(req, slideCreateInput);
  const [slide] = await insertSlides(
    id,
    [
      {
        template: input.template,
        title: input.title,
        body: input.body,
        notes: input.notes,
        source: "MANUAL",
        isAiDraft: false,
        questionId: input.questionId ?? null,
      },
    ],
    input.position,
  );
  return json(slide, 201);
});

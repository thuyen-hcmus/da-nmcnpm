import { json, parseBody, requireLecturer, route } from "@/server/http";
import { reorderSlides } from "@/server/services/lecture-service";
import { slideOrderInput } from "@/shared/contracts";

export const PUT = route<{ id: string }>(async (req, { id }) => {
  const u = await requireLecturer();
  const input = await parseBody(req, slideOrderInput);
  await reorderSlides(u.id, id, input.slideIds);
  return json({ ok: true });
});

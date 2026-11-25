import { json, parseBody, requireLecturer, route } from "@/server/http";
import { deleteSlide, updateSlide } from "@/server/services/lecture-service";
import { slideUpdateInput } from "@/shared/contracts";

type P = { id: string };

export const PATCH = route<P>(async (req, { id }) => {
  const u = await requireLecturer();
  const input = await parseBody(req, slideUpdateInput);
  return json(await updateSlide(u.id, id, input));
});

export const DELETE = route<P>(async (_req, { id }) => {
  const u = await requireLecturer();
  await deleteSlide(u.id, id);
  return new Response(null, { status: 204 });
});

import { json, parseBody, requireLecturer, route } from "@/server/http";
import { deleteLecture, getLectureDetail, updateLecture } from "@/server/services/lecture-service";
import { lectureUpdateInput } from "@/shared/contracts";

type P = { id: string };

export const GET = route<P>(async (_req, { id }) => {
  const u = await requireLecturer();
  return json(await getLectureDetail(u.id, id));
});

export const PATCH = route<P>(async (req, { id }) => {
  const u = await requireLecturer();
  const input = await parseBody(req, lectureUpdateInput);
  const l = await updateLecture(u.id, id, input);
  return json({ id: l.id, title: l.title, outline: l.outline });
});

export const DELETE = route<P>(async (_req, { id }) => {
  const u = await requireLecturer();
  await deleteLecture(u.id, id);
  return new Response(null, { status: 204 });
});

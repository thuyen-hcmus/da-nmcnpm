import { json, parseBody, requireLecturer, route } from "@/server/http";
import { createLecture, listLectures } from "@/server/services/lecture-service";
import { lectureCreateInput } from "@/shared/contracts";

export const GET = route(async () => {
  const u = await requireLecturer();
  return json(await listLectures(u.id));
});

export const POST = route(async (req) => {
  const u = await requireLecturer();
  const input = await parseBody(req, lectureCreateInput);
  const l = await createLecture(u.id, input.title);
  return json({ id: l.id, title: l.title }, 201);
});

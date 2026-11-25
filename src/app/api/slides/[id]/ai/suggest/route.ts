import { json, parseBody, requireLecturer, route } from "@/server/http";
import { suggestForSlide } from "@/server/ai/ai-service";
import { aiSuggestInput } from "@/shared/contracts";

/** Trả về đề xuất, KHÔNG lưu — giảng viên tự chấp nhận hoặc bỏ. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const u = await requireLecturer();
  const input = await parseBody(req, aiSuggestInput);
  return json({ suggestion: await suggestForSlide(u.id, id, input.action) });
});

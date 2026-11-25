import { json, requireLecturer, route } from "@/server/http";
import { insertSlides, ownedLecture } from "@/server/services/lecture-service";
import { extractPptx, PPTX_MAX_BYTES } from "@/server/pptx/extract";
import { AppError } from "@/shared/errors";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const u = await requireLecturer();
  await ownedLecture(u.id, id);
  // từ chối sớm theo Content-Length trước khi đọc nội dung (FR-061)
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > PPTX_MAX_BYTES + 1024 * 1024) throw new AppError("PAYLOAD_TOO_LARGE");
  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    throw new AppError("VALIDATION_ERROR", "Thiếu tệp");
  }
  if (!file) throw new AppError("VALIDATION_ERROR", "Thiếu tệp");
  if (file.size > PPTX_MAX_BYTES) throw new AppError("PAYLOAD_TOO_LARGE");
  if (!/\.pptx$/i.test(file.name)) throw new AppError("PPTX_INVALID", "Chỉ hỗ trợ tệp .pptx");
  const slides = await extractPptx(await file.arrayBuffer());
  const created = await insertSlides(
    id,
    slides.map((s, i) => ({
      template: i === 0 && !s.body ? ("TITLE" as const) : ("CONTENT" as const),
      title: s.title,
      body: s.body,
      notes: s.notes,
      source: "PPTX" as const,
      isAiDraft: false,
    })),
  );
  return json({ slides: created }, 201);
});

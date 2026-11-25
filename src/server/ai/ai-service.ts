import type { z } from "zod";
import { db } from "../db";
import { env } from "../env";
import { log } from "../log";
import { AppError } from "@/shared/errors";
import type { AiProvider, JsonKind } from "./provider";
import { FakeAiProvider } from "./fake-provider";
import { BadOutputError, GeminiProvider } from "./gemini-provider";
import { aiQuiz, aiSlides, aiSuggestion } from "./schemas";
import { ownedLecture, ownedSlide, insertSlides } from "../services/lecture-service";
import { createQuestion } from "../services/question-service";

export const AI_TIMEOUT_MS = 30_000;

let provider: AiProvider | null = null;
export function getProvider(): AiProvider {
  if (provider) return provider;
  const e = env();
  if (e.AI_PROVIDER === "fake") provider = new FakeAiProvider();
  else {
    if (!e.AI_API_KEY) throw new AppError("AI_ERROR", "Chưa cấu hình khóa AI (AI_API_KEY)");
    provider = new GeminiProvider(e.AI_API_KEY, e.AI_MODEL);
  }
  return provider;
}
export function setProvider(p: AiProvider | null) {
  provider = p;
}

const SYSTEM = [
  "Bạn là trợ lý soạn bài giảng đại học bằng tiếng Việt.",
  "Viết ngắn gọn, chính xác, phù hợp trình chiếu: mỗi slide tối đa 5 ý, mỗi ý một dòng ngắn.",
  "Chỉ trả về JSON đúng schema được yêu cầu, không thêm chữ ngoài JSON.",
].join(" ");

/** Gọi AI với timeout 30 giây, retry tối đa 2 lần (backoff) khi lỗi mạng/5xx; validate bằng zod (FR-024). */
export async function callAi<S extends z.ZodTypeAny>(kind: JsonKind, prompt: string, schema: S, timeoutMs = AI_TIMEOUT_MS): Promise<z.infer<S>> {
  const p = getProvider();
  let lastErr: unknown;
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt)); // backoff khi 5xx/quá tải
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), remaining);
    try {
      const raw = await Promise.race([
        p.generateJson(kind, SYSTEM, prompt, ac.signal),
        new Promise<never>((_, reject) => ac.signal.addEventListener("abort", () => reject(new TimeoutError()))),
      ]);
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        log.warn("AI bad output", { kind, issues: parsed.error.issues.slice(0, 3).map((i) => i.message) });
        throw new AppError("AI_BAD_OUTPUT");
      }
      return parsed.data;
    } catch (e) {
      if (e instanceof AppError) throw e; // sai định dạng: không retry
      if (e instanceof BadOutputError) throw new AppError("AI_BAD_OUTPUT");
      if (e instanceof TimeoutError || ac.signal.aborted) throw new AppError("AI_TIMEOUT");
      lastErr = e;
      log.warn("AI call failed", { kind, attempt, message: (e as Error).message?.slice(0, 200) });
      const status = (e as { status?: number }).status;
      if (status && status >= 400 && status < 500) break; // lỗi cấu hình/khóa/model: không retry
    } finally {
      clearTimeout(timer);
    }
  }
  if (Date.now() >= deadline) throw new AppError("AI_TIMEOUT");
  log.error("AI error", lastErr instanceof Error ? lastErr.message : lastErr);
  throw new AppError("AI_ERROR");
}

class TimeoutError extends Error {}

function slideText(s: { title: string; body: string; notes?: string }) {
  return `Tiêu đề: ${s.title}\nNội dung:\n${s.body}`;
}

/** Cách 2: từ ý tưởng → bộ slide nháp (FR-020). */
export async function generateSlides(userId: string, lectureId: string, input: { topic: string; audience: string; slideCount: number }) {
  await ownedLecture(userId, lectureId);
  const prompt = [
    `Tạo bộ slide bài giảng.`,
    `CHỦ_ĐỀ=${input.topic}`,
    `ĐỐI_TƯỢNG=${input.audience}`,
    `SỐ_SLIDE=${input.slideCount}`,
    `Yêu cầu: đúng ${input.slideCount} slide; slide đầu là TITLE, còn lại CONTENT; mỗi slide có ghi chú thuyết trình 1–3 câu.`,
  ].join("\n");
  const out = await callAi("slides", prompt, aiSlides);
  if (out.slides.length !== input.slideCount) throw new AppError("AI_BAD_OUTPUT", `AI trả về ${out.slides.length} slide thay vì ${input.slideCount}, vui lòng thử lại`);
  return insertSlides(
    lectureId,
    out.slides.map((s) => ({ ...s, source: "AI" as const, isAiDraft: true })),
  );
}

/** Cách 1: văn bản dán → chia slide (FR-021). */
export async function splitText(userId: string, lectureId: string, input: { text: string; maxSlides?: number }) {
  await ownedLecture(userId, lectureId);
  const prompt = [
    `Chia văn bản sau thành các slide trình chiếu (tối đa ${input.maxSlides ?? 10} slide), rút gọn thành các ý chính, kèm ghi chú thuyết trình.`,
    `SỐ_SLIDE=${Math.min(input.maxSlides ?? 5, 20)}`,
    `--- VĂN BẢN ---`,
    input.text,
  ].join("\n");
  const out = await callAi("slides", prompt, aiSlides);
  const slides = out.slides.slice(0, input.maxSlides ?? 20);
  return insertSlides(
    lectureId,
    slides.map((s) => ({ ...s, source: "AI" as const, isAiDraft: true })),
  );
}

const ACTIONS = {
  condense: "Rút gọn nội dung slide còn tối đa 4 ý ngắn. Trả về title và body.",
  notes: "Viết ghi chú thuyết trình (3–5 câu) cho slide này. Chỉ trả về notes.",
  rewrite: "Viết lại slide cho rõ ràng, dễ hiểu hơn với sinh viên. Trả về title và body.",
  expand: "Bổ sung 1–2 ý hoặc ví dụ còn thiếu cho slide. Trả về title và body.",
} as const;

/** Gợi ý cho một slide có sẵn — KHÔNG lưu, giảng viên chấp nhận hoặc bỏ (FR-021). */
export async function suggestForSlide(userId: string, slideId: string, action: keyof typeof ACTIONS) {
  const s = await ownedSlide(userId, slideId);
  const prompt = `${ACTIONS[action]}\n\n${slideText(s)}\nGhi chú hiện tại: ${s.notes || "(không có)"}`;
  const out = await callAi("suggestion", prompt, aiSuggestion);
  if (action === "notes") return { notes: out.notes ?? "" };
  return { title: out.title ?? s.title, body: out.body ?? s.body };
}

/** Tạo quiz nháp từ slide đã chọn, kèm slide căn cứ (FR-022). */
export async function generateQuiz(userId: string, lectureId: string, input: { slideIds: string[]; count: number }) {
  await ownedLecture(userId, lectureId);
  const slides = await db.slide.findMany({ where: { lectureId, id: { in: input.slideIds } }, orderBy: { position: "asc" } });
  if (slides.length !== new Set(input.slideIds).size) throw new AppError("VALIDATION_ERROR", "Slide không thuộc bài giảng");
  const prompt = [
    `Tạo câu hỏi trắc nghiệm kiểm tra nhanh, CHỈ dựa trên nội dung các slide dưới đây (không hỏi kiến thức ngoài slide).`,
    `SỐ_CÂU=${input.count}`,
    `Mỗi câu: 2–6 lựa chọn, đúng một đáp án đúng (correctIndex tính từ 0), giải thích ngắn, sourceSlideNumbers là số slide căn cứ.`,
    ...slides.map((s) => `[Slide ${s.position + 1}]\n${slideText(s)}`),
  ].join("\n\n");
  const out = await callAi("quiz", prompt, aiQuiz);
  const byNumber = new Map(slides.map((s) => [s.position + 1, s.id]));
  const created = [];
  for (const q of out.questions.slice(0, input.count)) {
    let sourceSlideIds = q.sourceSlideNumbers.map((n) => byNumber.get(n)).filter((x): x is string => !!x);
    if (sourceSlideIds.length === 0) sourceSlideIds = slides.map((s) => s.id); // mặc định: các slide đã chọn
    created.push(
      await createQuestion(
        lectureId,
        { prompt: q.prompt, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation, sourceSlideIds },
        "AI",
      ),
    );
  }
  return created;
}

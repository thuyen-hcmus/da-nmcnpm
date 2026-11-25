import { db } from "../db";
import { AppError } from "@/shared/errors";
import { questionInput } from "@/shared/contracts";
import { ownedLecture, serializeQuestion } from "./lecture-service";

async function ownedQuestion(userId: string, questionId: string) {
  const q = await db.quizQuestion.findUnique({ where: { id: questionId }, include: { lecture: true } });
  if (!q) throw new AppError("NOT_FOUND", "Không tìm thấy câu hỏi");
  if (q.lecture.ownerId !== userId) throw new AppError("FORBIDDEN");
  return q;
}

async function checkSourceSlides(lectureId: string, ids: string[]) {
  if (ids.length === 0) return;
  const n = await db.slide.count({ where: { lectureId, id: { in: ids } } });
  if (n !== new Set(ids).size) throw new AppError("VALIDATION_ERROR", "Slide căn cứ không thuộc bài giảng");
}

export async function createQuestion(
  lectureId: string,
  input: { prompt: string; options: string[]; correctIndex: number; explanation: string; sourceSlideIds: string[] },
  source: "MANUAL" | "AI" = "MANUAL",
) {
  await checkSourceSlides(lectureId, input.sourceSlideIds);
  const q = await db.quizQuestion.create({
    data: {
      lectureId,
      prompt: input.prompt,
      options: JSON.stringify(input.options),
      correctIndex: input.correctIndex,
      explanation: input.explanation,
      sourceSlideIds: JSON.stringify(input.sourceSlideIds),
      status: "DRAFT", // mọi câu mới đều là nháp (FR-023, FR-030)
      source,
    },
  });
  return serializeQuestion(q);
}

export async function createQuestionForUser(userId: string, lectureId: string, input: Parameters<typeof createQuestion>[1]) {
  await ownedLecture(userId, lectureId);
  return createQuestion(lectureId, input);
}

/** Sửa câu hỏi → luôn quay về DRAFT, phải duyệt lại (FR-030). */
export async function updateQuestion(
  userId: string,
  questionId: string,
  patch: { prompt?: string; options?: string[]; correctIndex?: number; explanation?: string; sourceSlideIds?: string[] },
) {
  const q = await ownedQuestion(userId, questionId);
  const merged = {
    prompt: patch.prompt ?? q.prompt,
    options: patch.options ?? (JSON.parse(q.options) as string[]),
    correctIndex: patch.correctIndex ?? q.correctIndex,
    explanation: patch.explanation ?? q.explanation,
    sourceSlideIds: patch.sourceSlideIds ?? (JSON.parse(q.sourceSlideIds) as string[]),
  };
  const check = questionInput.safeParse(merged);
  if (!check.success) throw new AppError("VALIDATION_ERROR", check.error.issues[0]?.message, check.error.issues);
  await checkSourceSlides(q.lectureId, merged.sourceSlideIds);
  const u = await db.quizQuestion.update({
    where: { id: questionId },
    data: {
      prompt: merged.prompt,
      options: JSON.stringify(merged.options),
      correctIndex: merged.correctIndex,
      explanation: merged.explanation,
      sourceSlideIds: JSON.stringify(merged.sourceSlideIds),
      status: "DRAFT",
      approvedAt: null,
    },
  });
  return serializeQuestion(u);
}

export async function approveQuestion(userId: string, questionId: string) {
  const q = await ownedQuestion(userId, questionId);
  const check = questionInput.safeParse({
    prompt: q.prompt,
    options: JSON.parse(q.options),
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    sourceSlideIds: JSON.parse(q.sourceSlideIds),
  });
  if (!check.success) throw new AppError("VALIDATION_ERROR", check.error.issues[0]?.message);
  const u = await db.quizQuestion.update({ where: { id: questionId }, data: { status: "APPROVED", approvedAt: new Date() } });
  return serializeQuestion(u);
}

export async function deleteQuestion(userId: string, questionId: string) {
  await ownedQuestion(userId, questionId);
  await db.quizQuestion.delete({ where: { id: questionId } });
}

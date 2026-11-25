import { db } from "../db";
import { AppError } from "@/shared/errors";
import { notifyDelta, notifyState } from "../realtime/bus";
import { withSessionLock } from "./session-lock";
import { assertLecturer, assertStudent, type Actor } from "./actor";

async function ownedLiveSession(actor: Actor) {
  assertLecturer(actor);
  const s = await db.session.findUnique({ where: { id: actor.sessionId } });
  if (!s) throw new AppError("NOT_FOUND");
  if (s.ownerId !== actor.userId) throw new AppError("FORBIDDEN");
  if (s.status !== "LIVE") throw new AppError("SESSION_ENDED");
  return s;
}

async function runOf(sessionId: string, quizRunId: string) {
  const run = await db.quizRun.findUnique({ where: { id: quizRunId } });
  if (!run || run.sessionId !== sessionId) throw new AppError("NOT_FOUND", "Không tìm thấy quiz");
  return run;
}

/** Mở quiz: chỉ câu APPROVED của đúng bài giảng; tối đa 1 quiz OPEN mỗi phiên. */
export function openQuiz(actor: Actor, questionId: string) {
  return withSessionLock(actor.sessionId, async () => {
    const s = await ownedLiveSession(actor);
    const q = await db.quizQuestion.findUnique({ where: { id: questionId } });
    if (!q || q.lectureId !== s.lectureId) throw new AppError("NOT_FOUND", "Không tìm thấy câu hỏi");
    if (q.status !== "APPROVED") throw new AppError("CONFLICT", "Câu hỏi chưa được duyệt");
    const open = await db.quizRun.findFirst({ where: { sessionId: s.id, status: "OPEN" } });
    if (open) throw new AppError("CONFLICT", "Đang có quiz mở, hãy đóng trước");

    const updated = await db.$transaction(async (tx) => {
      await tx.quizRun.updateMany({ where: { sessionId: s.id, onScreen: true }, data: { onScreen: false } });
      await tx.quizRun.create({
        data: {
          sessionId: s.id,
          questionId: q.id,
          prompt: q.prompt,
          options: q.options,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
          status: "OPEN",
          onScreen: true,
        },
      });
      return tx.session.update({ where: { id: s.id }, data: { stateVersion: { increment: 1 } } });
    });
    notifyState(s.id);
    return { v: updated.stateVersion };
  });
}

function transition(actor: Actor, quizRunId: string, from: string, to: "CLOSED" | "PUBLISHED") {
  return withSessionLock(actor.sessionId, async () => {
    const s = await ownedLiveSession(actor);
    const run = await runOf(s.id, quizRunId);
    if (run.status !== from) {
      const msg =
        to === "PUBLISHED" && run.status === "OPEN"
          ? "Cần đóng quiz trước khi công bố kết quả"
          : "Quiz không ở trạng thái phù hợp";
      throw new AppError("CONFLICT", msg);
    }
    const now = new Date();
    const updated = await db.$transaction(async (tx) => {
      await tx.quizRun.update({
        where: { id: run.id },
        data: to === "CLOSED" ? { status: "CLOSED", closedAt: now } : { status: "PUBLISHED", publishedAt: now, onScreen: true },
      });
      return tx.session.update({ where: { id: s.id }, data: { stateVersion: { increment: 1 } } });
    });
    notifyState(s.id);
    return { v: updated.stateVersion };
  });
}

export const closeQuiz = (actor: Actor, quizRunId: string) => transition(actor, quizRunId, "OPEN", "CLOSED");
export const publishQuiz = (actor: Actor, quizRunId: string) => transition(actor, quizRunId, "CLOSED", "PUBLISHED");

export function hideQuiz(actor: Actor, quizRunId: string) {
  return withSessionLock(actor.sessionId, async () => {
    const s = await ownedLiveSession(actor);
    const run = await runOf(s.id, quizRunId);
    if (run.status === "OPEN") throw new AppError("CONFLICT", "Cần đóng quiz trước khi gỡ khỏi màn chiếu");
    const updated = await db.$transaction(async (tx) => {
      await tx.quizRun.update({ where: { id: run.id }, data: { onScreen: false } });
      return tx.session.update({ where: { id: s.id }, data: { stateVersion: { increment: 1 } } });
    });
    notifyState(s.id);
    return { v: updated.stateVersion };
  });
}

/** Sinh viên nộp đáp án: một lượt duy nhất (ràng buộc unique ở CSDL), chỉ khi OPEN. */
export function answerQuiz(actor: Actor, quizRunId: string, optionIndex: number) {
  assertStudent(actor);
  return withSessionLock(actor.sessionId, async () => {
    const s = await db.session.findUnique({ where: { id: actor.sessionId } });
    if (!s) throw new AppError("NOT_FOUND");
    if (s.status !== "LIVE") throw new AppError("SESSION_ENDED");
    const run = await runOf(s.id, quizRunId);
    if (run.status !== "OPEN") throw new AppError("QUIZ_CLOSED");
    const options = JSON.parse(run.options) as string[];
    if (optionIndex < 0 || optionIndex >= options.length) throw new AppError("VALIDATION_ERROR", "Lựa chọn không hợp lệ");
    try {
      await db.answer.create({ data: { quizRunId: run.id, participantId: actor.participantId, optionIndex } });
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "P2002") throw new AppError("ALREADY_ANSWERED");
      throw e;
    }
    notifyDelta(s.id);
    return { v: s.stateVersion };
  });
}

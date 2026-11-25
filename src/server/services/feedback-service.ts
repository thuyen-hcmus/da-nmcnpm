import { db } from "../db";
import { AppError } from "@/shared/errors";
import { notifyDelta, notifyState } from "../realtime/bus";
import { withSessionLock } from "./session-lock";
import { assertLecturer, assertStudent, type Actor } from "./actor";

async function liveSession(sessionId: string) {
  const s = await db.session.findUnique({ where: { id: sessionId } });
  if (!s) throw new AppError("NOT_FOUND");
  if (s.status !== "LIVE") throw new AppError("SESSION_ENDED");
  return s;
}

/** Câu hỏi sinh viên: mặc định chỉ giảng viên thấy (FR-051). */
export async function askQuestion(actor: Actor, text: string) {
  assertStudent(actor);
  const s = await liveSession(actor.sessionId);
  const clean = text.trim();
  if (clean.length < 1 || clean.length > 500) throw new AppError("VALIDATION_ERROR", "Câu hỏi dài 1–500 ký tự");
  const q = await db.studentQuestion.create({
    data: { sessionId: s.id, participantId: actor.participantId, text: clean },
  });
  notifyDelta(s.id);
  return { v: s.stateVersion, id: q.id };
}

export function updateQuestion(
  actor: Actor,
  input: { questionId: string; status?: "NEW" | "ANSWERED" | "HIDDEN"; spotlight?: boolean },
) {
  return withSessionLock(actor.sessionId, async () => {
    assertLecturer(actor);
    const s = await liveSession(actor.sessionId);
    if (s.ownerId !== actor.userId) throw new AppError("FORBIDDEN");
    const q = await db.studentQuestion.findUnique({ where: { id: input.questionId } });
    if (!q || q.sessionId !== s.id) throw new AppError("NOT_FOUND");

    let spotlightQuestionId = s.spotlightQuestionId;
    if (input.spotlight === true) spotlightQuestionId = q.id;
    if (input.spotlight === false && spotlightQuestionId === q.id) spotlightQuestionId = null;
    if (input.status === "HIDDEN" && spotlightQuestionId === q.id) spotlightQuestionId = null;

    const updated = await db.$transaction(async (tx) => {
      if (input.status) await tx.studentQuestion.update({ where: { id: q.id }, data: { status: input.status } });
      return tx.session.update({
        where: { id: s.id },
        data: { spotlightQuestionId, stateVersion: { increment: 1 } },
      });
    });
    notifyState(s.id);
    return { v: updated.stateVersion };
  });
}

/** Biểu cảm: mỗi sinh viên tối đa một trạng thái cho mỗi slide; kind = null để bỏ (FR-052). */
export function setReaction(actor: Actor, slideIndex: number, kind: "UNDERSTOOD" | "CONFUSED" | null) {
  assertStudent(actor);
  return withSessionLock(actor.sessionId, async () => {
    const s = await liveSession(actor.sessionId);
    if (slideIndex > s.maxPublishedIndex) throw new AppError("FORBIDDEN", "Slide chưa được công bố");
    const where = { participantId_slideIndex: { participantId: actor.participantId, slideIndex } };
    if (kind === null) {
      await db.reaction.deleteMany({ where: { participantId: actor.participantId, slideIndex } });
    } else {
      await db.reaction.upsert({
        where,
        create: { sessionId: s.id, participantId: actor.participantId, slideIndex, kind },
        update: { kind },
      });
    }
    notifyDelta(s.id);
    return { v: s.stateVersion, kind };
  });
}

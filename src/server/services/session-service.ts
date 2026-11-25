import { db } from "../db";
import { AppError } from "@/shared/errors";
import { hashToken, randomToken, sessionCode } from "../auth/crypto";
import { projectorTokenFor } from "../projections";
import { notifyDelta, notifyState } from "../realtime/bus";
import { withSessionLock } from "./session-lock";
import { assertLecturer, type Actor } from "./actor";
import { joinUrl, projectorUrl } from "../urls";

/** Lấy phiên đang LIVE và kiểm tra giảng viên là chủ phiên. */
async function liveSessionOwnedBy(actor: Actor) {
  assertLecturer(actor);
  const s = await db.session.findUnique({ where: { id: actor.sessionId } });
  if (!s) throw new AppError("NOT_FOUND");
  if (s.ownerId !== actor.userId) throw new AppError("FORBIDDEN");
  if (s.status !== "LIVE") throw new AppError("SESSION_ENDED");
  return s;
}

export async function createSession(userId: string, lectureId: string) {
  const lecture = await db.lecture.findUnique({
    where: { id: lectureId },
    include: { slides: { orderBy: { position: "asc" } } },
  });
  if (!lecture) throw new AppError("NOT_FOUND");
  if (lecture.ownerId !== userId) throw new AppError("FORBIDDEN");
  if (lecture.slides.length === 0) throw new AppError("CONFLICT", "Bài giảng chưa có slide nào");

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = sessionCode();
    try {
      const session = await db.$transaction(async (tx) => {
        const s = await tx.session.create({
          data: {
            lectureId,
            ownerId: userId,
            code,
            projectorTokenHash: "pending",
            lectureTitle: lecture.title,
            outline: lecture.outline,
            slides: {
              create: lecture.slides.map((sl, i) => ({
                index: i,
                template: sl.template,
                title: sl.title,
                body: sl.body,
                notes: sl.notes,
                quizQuestionId: sl.questionId,
              })),
            },
          },
        });
        return tx.session.update({
          where: { id: s.id },
          data: { projectorTokenHash: hashToken(projectorTokenFor(s.id)) },
        });
      });
      return {
        session,
        joinUrl: joinUrl(session.code),
        projectorUrl: projectorUrl(session.code, projectorTokenFor(session.id)),
      };
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "P2002") continue; // trùng mã phiên, thử lại
      throw e;
    }
  }
  throw new AppError("INTERNAL", "Không tạo được mã phiên");
}

export function gotoSlide(actor: Actor, index: number) {
  return withSessionLock(actor.sessionId, async () => {
    const s = await liveSessionOwnedBy(actor);
    const count = await db.sessionSlide.count({ where: { sessionId: s.id } });
    if (index < 0 || index >= count) throw new AppError("VALIDATION_ERROR", "Slide không tồn tại");
    const updated = await db.session.update({
      where: { id: s.id },
      data: {
        currentIndex: index,
        maxPublishedIndex: Math.max(s.maxPublishedIndex, index), // không bao giờ giảm (FR-044)
        stateVersion: { increment: 1 },
      },
    });
    notifyState(s.id);
    return { v: updated.stateVersion };
  });
}

export function toggleQr(actor: Actor, show: boolean) {
  return withSessionLock(actor.sessionId, async () => {
    const s = await liveSessionOwnedBy(actor);
    const updated = await db.session.update({
      where: { id: s.id },
      data: { showJoinQr: show, stateVersion: { increment: 1 } },
    });
    notifyState(s.id);
    return { v: updated.stateVersion };
  });
}

export function endSession(actor: Actor) {
  return withSessionLock(actor.sessionId, async () => {
    const s = await liveSessionOwnedBy(actor);
    const now = new Date();
    const updated = await db.$transaction(async (tx) => {
      await tx.quizRun.updateMany({ where: { sessionId: s.id, status: "OPEN" }, data: { status: "CLOSED", closedAt: now } });
      return tx.session.update({
        where: { id: s.id },
        data: { status: "ENDED", endedAt: now, stateVersion: { increment: 1 } },
      });
    });
    notifyState(s.id);
    return { v: updated.stateVersion };
  });
}

/** Sinh viên vào phiên; token cũ hợp lệ → trả lại người tham gia cũ (tải lại trang). */
export async function joinSession(code: string, input: { displayName?: string; participantToken?: string }) {
  const s = await db.session.findUnique({ where: { code: code.toUpperCase() } });
  if (!s) throw new AppError("NOT_FOUND", "Không tìm thấy phiên");
  if (s.status !== "LIVE") throw new AppError("SESSION_ENDED");

  if (input.participantToken) {
    const existing = await db.participant.findUnique({ where: { tokenHash: hashToken(input.participantToken) } });
    if (existing && existing.sessionId === s.id) {
      const name = input.displayName?.trim();
      const p =
        name !== undefined && name !== (existing.displayName ?? "")
          ? await db.participant.update({ where: { id: existing.id }, data: { displayName: name || null } })
          : existing;
      return { participantToken: input.participantToken, participant: { id: p.id, displayName: p.displayName } };
    }
  }
  const token = randomToken();
  const p = await db.participant.create({
    data: { sessionId: s.id, tokenHash: hashToken(token), displayName: input.displayName?.trim() || null },
  });
  notifyDelta(s.id);
  return { participantToken: token, participant: { id: p.id, displayName: p.displayName } };
}

export async function publicSessionInfo(code: string) {
  const s = await db.session.findUnique({ where: { code: code.toUpperCase() } });
  if (!s) throw new AppError("NOT_FOUND", "Không tìm thấy phiên");
  return { status: s.status as "LIVE" | "ENDED", lectureTitle: s.lectureTitle };
}

/** REST lấy một slide cho sinh viên/máy chiếu: chỉ slide đã công bố, không ghi chú (FR-045). */
export async function publicSlide(code: string, index: number) {
  const s = await db.session.findUnique({ where: { code: code.toUpperCase() } });
  if (!s) throw new AppError("NOT_FOUND");
  if (index > s.maxPublishedIndex) throw new AppError("FORBIDDEN", "Slide chưa được công bố");
  const slide = await db.sessionSlide.findUnique({ where: { sessionId_index: { sessionId: s.id, index } } });
  if (!slide) throw new AppError("NOT_FOUND");
  return { index: slide.index, template: slide.template, title: slide.title, body: slide.body };
}

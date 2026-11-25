import { db } from "../db";
import { AppError } from "@/shared/errors";

/** Báo cáo sau buổi (FR-060). */
export async function sessionReport(userId: string, sessionId: string) {
  const s = await db.session.findUnique({
    where: { id: sessionId },
    include: {
      slides: { orderBy: { index: "asc" }, select: { index: true, title: true } },
      quizRuns: { orderBy: { openedAt: "asc" }, include: { answers: { select: { optionIndex: true } } } },
      studentQuestions: { orderBy: { createdAt: "asc" }, include: { participant: { select: { displayName: true } } } },
      reactions: { select: { slideIndex: true, kind: true } },
      _count: { select: { participants: true } },
    },
  });
  if (!s) throw new AppError("NOT_FOUND");
  if (s.ownerId !== userId) throw new AppError("FORBIDDEN");

  const quizzes = s.quizRuns.map((r) => {
    const options = JSON.parse(r.options) as string[];
    const counts = options.map(() => 0);
    for (const a of r.answers) if (a.optionIndex < counts.length) counts[a.optionIndex]++;
    const total = r.answers.length;
    return {
      id: r.id,
      prompt: r.prompt,
      options,
      counts,
      total,
      correctIndex: r.correctIndex,
      correctRate: total ? counts[r.correctIndex] / total : 0,
      status: r.status,
    };
  });

  const reactions = s.slides.map((sl) => {
    const rs = s.reactions.filter((r) => r.slideIndex === sl.index);
    return {
      slideIndex: sl.index,
      title: sl.title,
      understood: rs.filter((r) => r.kind === "UNDERSTOOD").length,
      confused: rs.filter((r) => r.kind === "CONFUSED").length,
    };
  });

  return {
    session: {
      id: s.id,
      code: s.code,
      lectureId: s.lectureId,
      lectureTitle: s.lectureTitle,
      status: s.status,
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      slideCount: s.slides.length,
      maxPublishedIndex: s.maxPublishedIndex,
    },
    participantCount: s._count.participants,
    quizzes,
    questions: s.studentQuestions.map((q) => ({
      id: q.id,
      text: q.text,
      displayName: q.participant.displayName,
      status: q.status,
      createdAt: q.createdAt.toISOString(),
    })),
    reactions,
  };
}

export type SessionReport = Awaited<ReturnType<typeof sessionReport>>;

/**
 * ĐIỂM KIỂM TRA QUYỀN CHO DỮ LIỆU ĐẦU RA (ADR-002).
 *
 * Mọi dữ liệu phiên gửi tới máy chiếu và sinh viên đều phải đi qua các hàm `to*State` ở đây.
 * Quy tắc:
 *  - Chỉ slide có index ≤ maxPublishedIndex.
 *  - Không bao giờ có notes / outline.
 *  - Quiz chưa PUBLISHED: không có correctIndex, explanation, counts.
 *  - Câu hỏi sinh viên: chỉ câu đang được chiếu (spotlight) mới tới máy chiếu; không tới sinh viên khác.
 */
import { createHmac } from "node:crypto";
import { db } from "./db";
import { env } from "./env";
import { joinUrl, projectorUrl } from "./urls";
import type {
  LecturerDelta,
  LecturerQuizRun,
  LecturerState,
  ProjectorState,
  PublicQuizRun,
  PublicSlide,
  ReactionKind,
  ReactionSummary,
  SlideTemplate,
  StudentQuestionView,
  StudentState,
} from "@/shared/contracts";

export function projectorTokenFor(sessionId: string) {
  return createHmac("sha256", env().SESSION_SECRET).update(`projector:${sessionId}`).digest("base64url");
}

export type SessionView = Awaited<ReturnType<typeof loadSessionView>>;

/** Đọc toàn bộ trạng thái phiên từ CSDL (nguồn trạng thái duy nhất). */
export async function loadSessionView(sessionId: string) {
  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { slides: { orderBy: { index: "asc" } } },
  });
  if (!session) return null;

  const activeRun = await db.quizRun.findFirst({
    where: { sessionId, onScreen: true },
    orderBy: { openedAt: "desc" },
  });
  const answers = activeRun
    ? await db.answer.findMany({ where: { quizRunId: activeRun.id }, select: { participantId: true, optionIndex: true } })
    : [];
  const reactions = await db.reaction.findMany({
    where: { sessionId, slideIndex: session.currentIndex },
    select: { participantId: true, kind: true },
  });
  return { session, activeRun, answers, reactions };
}

function toPublicSlide(s: { index: number; template: string; title: string; body: string }): PublicSlide {
  return { index: s.index, template: s.template as SlideTemplate, title: s.title, body: s.body };
}

function counts(options: string[], answers: { optionIndex: number }[]) {
  const c = options.map(() => 0);
  for (const a of answers) if (a.optionIndex >= 0 && a.optionIndex < c.length) c[a.optionIndex]++;
  return c;
}

function publicQuiz(view: NonNullable<SessionView>): PublicQuizRun | null {
  const run = view.activeRun;
  if (!run) return null;
  const options = JSON.parse(run.options) as string[];
  const base: PublicQuizRun = { id: run.id, prompt: run.prompt, options, status: run.status as PublicQuizRun["status"] };
  if (run.status === "PUBLISHED") {
    base.result = {
      counts: counts(options, view.answers),
      total: view.answers.length,
      correctIndex: run.correctIndex,
      explanation: run.explanation,
    };
  }
  return base;
}

function base(view: NonNullable<SessionView>) {
  const s = view.session;
  return {
    v: s.stateVersion,
    status: s.status as "LIVE" | "ENDED",
    code: s.code,
    lectureTitle: s.lectureTitle,
    currentIndex: s.currentIndex,
    maxPublishedIndex: s.maxPublishedIndex,
    slideCount: view.session.slides.length,
  };
}

export function toStudentState(
  view: NonNullable<SessionView>,
  participant: { id: string; displayName: string | null },
): StudentState {
  const s = view.session;
  const mine = view.answers.find((a) => a.participantId === participant.id);
  const reaction = view.reactions.find((r) => r.participantId === participant.id);
  return {
    ...base(view),
    role: "student",
    slides: s.slides.filter((x) => x.index <= s.maxPublishedIndex).map(toPublicSlide),
    activeQuiz: publicQuiz(view),
    me: {
      participantId: participant.id,
      displayName: participant.displayName,
      answeredOptionIndex: mine ? mine.optionIndex : null,
      reactionForCurrent: (reaction?.kind as ReactionKind | undefined) ?? null,
    },
  };
}

export async function toProjectorState(view: NonNullable<SessionView>): Promise<ProjectorState> {
  const s = view.session;
  const current = s.slides.find((x) => x.index === s.currentIndex && x.index <= s.maxPublishedIndex);
  let spotlightQuestion: ProjectorState["spotlightQuestion"] = null;
  if (s.spotlightQuestionId) {
    const q = await db.studentQuestion.findFirst({
      where: { id: s.spotlightQuestionId, sessionId: s.id, status: { not: "HIDDEN" } },
      include: { participant: { select: { displayName: true } } },
    });
    if (q) spotlightQuestion = { text: q.text, displayName: q.participant.displayName ?? null };
  }
  return {
    ...base(view),
    role: "projector",
    currentSlide: current ? toPublicSlide(current) : null,
    showJoinQr: s.showJoinQr,
    joinUrl: joinUrl(s.code),
    activeQuiz: publicQuiz(view),
    spotlightQuestion,
  };
}

export function reactionSummary(view: NonNullable<SessionView>): ReactionSummary {
  let understood = 0;
  let confused = 0;
  for (const r of view.reactions) {
    if (r.kind === "UNDERSTOOD") understood++;
    else if (r.kind === "CONFUSED") confused++;
  }
  return { slideIndex: view.session.currentIndex, understood, confused };
}

async function studentQuestions(sessionId: string): Promise<StudentQuestionView[]> {
  const qs = await db.studentQuestion.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    include: { participant: { select: { displayName: true } } },
    take: 200,
  });
  return qs.map((q) => ({
    id: q.id,
    text: q.text,
    displayName: q.participant.displayName ?? null,
    status: q.status as StudentQuestionView["status"],
    createdAt: q.createdAt.toISOString(),
  }));
}

function lecturerQuiz(view: NonNullable<SessionView>): LecturerQuizRun | null {
  const run = view.activeRun;
  if (!run) return null;
  const pub = publicQuiz(view)!;
  const c = counts(pub.options, view.answers);
  return { ...pub, correctIndex: run.correctIndex, explanation: run.explanation, counts: c, total: view.answers.length, onScreen: run.onScreen };
}

export async function toLecturerState(view: NonNullable<SessionView>): Promise<LecturerState> {
  const s = view.session;
  const [participantCount, approved, questions] = await Promise.all([
    db.participant.count({ where: { sessionId: s.id } }),
    db.quizQuestion.findMany({
      where: { lectureId: s.lectureId, status: "APPROVED" },
      orderBy: { createdAt: "asc" },
      select: { id: true, prompt: true },
    }),
    studentQuestions(s.id),
  ]);
  return {
    ...base(view),
    role: "lecturer",
    sessionId: s.id,
    slides: s.slides.map((x) => ({ ...toPublicSlide(x), notes: x.notes, quizQuestionId: x.quizQuestionId })),
    outline: s.outline,
    showJoinQr: s.showJoinQr,
    activeQuiz: lecturerQuiz(view),
    approvedQuestions: approved,
    participantCount,
    reactions: reactionSummary(view),
    questions,
    spotlightQuestionId: s.spotlightQuestionId,
    joinUrl: joinUrl(s.code),
    projectorUrl: projectorUrl(s.code, projectorTokenFor(s.id)),
  };
}

export async function toLecturerDelta(view: NonNullable<SessionView>): Promise<LecturerDelta> {
  const q = lecturerQuiz(view);
  return {
    v: view.session.stateVersion,
    participantCount: await db.participant.count({ where: { sessionId: view.session.id } }),
    activeQuiz: q ? { id: q.id, counts: q.counts, total: q.total } : null,
    reactions: reactionSummary(view),
    questions: await studentQuestions(view.session.id),
  };
}

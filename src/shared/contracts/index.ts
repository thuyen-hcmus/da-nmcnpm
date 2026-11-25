/**
 * Hợp đồng FE/BE: specs/001-interactive-ai-lectures/contracts/
 * Mọi thay đổi ở đây phải cập nhật contracts/*.md trước (constitution VI).
 */
import { z } from "zod";
import type { ApiError } from "../errors";

export const SLIDE_TEMPLATES = ["TITLE", "CONTENT", "QUIZ"] as const;
export type SlideTemplate = (typeof SLIDE_TEMPLATES)[number];
export type QuestionStatus = "DRAFT" | "APPROVED";
export type QuizRunStatus = "OPEN" | "CLOSED" | "PUBLISHED";
export type ReactionKind = "UNDERSTOOD" | "CONFUSED";
export type Role = "lecturer" | "projector" | "student";

// ---------- REST input ----------

export const registerInput = z.object({
  email: z.string().trim().toLowerCase().email("Email không hợp lệ"),
  password: z.string().min(8, "Mật khẩu tối thiểu 8 ký tự").max(200),
  name: z.string().trim().min(1, "Nhập tên").max(80),
});
export const loginInput = z.object({
  email: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});

export const lectureCreateInput = z.object({ title: z.string().trim().min(1, "Nhập tên bài giảng").max(200) });
export const lectureUpdateInput = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  outline: z.string().max(5000).optional(),
});

export const slideCreateInput = z.object({
  template: z.enum(SLIDE_TEMPLATES).default("CONTENT"),
  title: z.string().max(200).default(""),
  body: z.string().max(5000).default(""),
  notes: z.string().max(5000).default(""),
  questionId: z.string().nullable().optional(),
  position: z.number().int().min(0).optional(),
});
export const slideUpdateInput = z.object({
  template: z.enum(SLIDE_TEMPLATES).optional(),
  title: z.string().max(200).optional(),
  body: z.string().max(5000).optional(),
  notes: z.string().max(5000).optional(),
  questionId: z.string().nullable().optional(),
  isAiDraft: z.boolean().optional(),
});
export const slideOrderInput = z.object({ slideIds: z.array(z.string()).min(1) });

const optionsSchema = z
  .array(z.string().trim().min(1, "Lựa chọn không được trống").max(200))
  .min(2, "Cần ít nhất 2 lựa chọn")
  .max(6, "Tối đa 6 lựa chọn")
  .refine((o) => new Set(o.map((x) => x.toLowerCase())).size === o.length, "Các lựa chọn không được trùng");

export const questionInput = z
  .object({
    prompt: z.string().trim().min(1, "Nhập câu hỏi").max(500),
    options: optionsSchema,
    correctIndex: z.number().int().min(0),
    explanation: z.string().max(1000).default(""),
    sourceSlideIds: z.array(z.string()).default([]),
  })
  .refine((q) => q.correctIndex < q.options.length, { message: "Đáp án đúng không hợp lệ", path: ["correctIndex"] });

export const questionUpdateInput = z
  .object({
    prompt: z.string().trim().min(1).max(500).optional(),
    options: optionsSchema.optional(),
    correctIndex: z.number().int().min(0).optional(),
    explanation: z.string().max(1000).optional(),
    sourceSlideIds: z.array(z.string()).optional(),
  });

export const aiGenerateSlidesInput = z.object({
  topic: z.string().trim().min(3, "Nhập chủ đề").max(500),
  audience: z.string().trim().max(200).default("Sinh viên đại học"),
  slideCount: z.number().int().min(1).max(20),
});
export const aiSplitTextInput = z.object({
  text: z.string().trim().min(20, "Văn bản quá ngắn").max(20000, "Tối đa 20.000 ký tự"),
  maxSlides: z.number().int().min(1).max(20).optional(),
});
export const aiSuggestInput = z.object({ action: z.enum(["condense", "notes", "rewrite", "expand"]) });
export const aiGenerateQuizInput = z.object({
  slideIds: z.array(z.string()).min(1, "Chọn ít nhất 1 slide"),
  count: z.number().int().min(1).max(5).default(1),
});

export const joinInput = z.object({
  displayName: z.string().trim().max(40).optional(),
  participantToken: z.string().max(200).optional(),
});

// ---------- Realtime input ----------

export const ev = {
  slideGoto: z.object({ index: z.number().int().min(0) }),
  qrToggle: z.object({ show: z.boolean() }),
  quizOpen: z.object({ questionId: z.string().min(1) }),
  quizRunId: z.object({ quizRunId: z.string().min(1) }),
  questionUpdate: z.object({
    questionId: z.string().min(1),
    status: z.enum(["NEW", "ANSWERED", "HIDDEN"]).optional(),
    spotlight: z.boolean().optional(),
  }),
  quizAnswer: z.object({ quizRunId: z.string().min(1), optionIndex: z.number().int().min(0).max(5) }),
  questionAsk: z.object({ text: z.string().trim().min(1, "Nhập câu hỏi").max(500, "Tối đa 500 ký tự") }),
  reactionSet: z.object({
    slideIndex: z.number().int().min(0),
    kind: z.enum(["UNDERSTOOD", "CONFUSED"]).nullable(),
  }),
};

// ---------- Output types ----------

export type PublicSlide = {
  index: number;
  template: SlideTemplate;
  title: string;
  body: string;
};

export type LecturerSlide = PublicSlide & { notes: string; quizQuestionId: string | null };

export type QuizResult = { counts: number[]; total: number; correctIndex: number; explanation: string };

export type PublicQuizRun = {
  id: string;
  prompt: string;
  options: string[];
  status: QuizRunStatus;
  /** chỉ có khi status = PUBLISHED */
  result?: QuizResult;
};

export type LecturerQuizRun = PublicQuizRun & {
  correctIndex: number;
  explanation: string;
  counts: number[];
  total: number;
  onScreen: boolean;
};

export type ReactionSummary = { slideIndex: number; understood: number; confused: number };

export type StudentQuestionView = {
  id: string;
  text: string;
  displayName: string | null;
  status: "NEW" | "ANSWERED" | "HIDDEN";
  createdAt: string;
};

type BaseState = {
  v: number;
  status: "LIVE" | "ENDED";
  code: string;
  lectureTitle: string;
  currentIndex: number;
  maxPublishedIndex: number;
  slideCount: number;
};

export type StudentState = BaseState & {
  role: "student";
  slides: PublicSlide[];
  activeQuiz: PublicQuizRun | null;
  me: {
    participantId: string;
    displayName: string | null;
    answeredOptionIndex: number | null;
    reactionForCurrent: ReactionKind | null;
  };
};

export type ProjectorState = BaseState & {
  role: "projector";
  currentSlide: PublicSlide | null;
  showJoinQr: boolean;
  joinUrl: string;
  activeQuiz: PublicQuizRun | null;
  spotlightQuestion: { text: string; displayName: string | null } | null;
};

export type LecturerState = BaseState & {
  role: "lecturer";
  sessionId: string;
  slides: LecturerSlide[];
  outline: string;
  showJoinQr: boolean;
  activeQuiz: LecturerQuizRun | null;
  approvedQuestions: { id: string; prompt: string }[];
  participantCount: number;
  reactions: ReactionSummary;
  questions: StudentQuestionView[];
  spotlightQuestionId: string | null;
  joinUrl: string;
  projectorUrl: string;
};

export type SessionState = StudentState | ProjectorState | LecturerState;

export type LecturerDelta = {
  v: number;
  participantCount: number;
  activeQuiz: { id: string; counts: number[]; total: number } | null;
  reactions: ReactionSummary;
  questions: StudentQuestionView[];
};

export type Ack<T = { v: number }> = ({ ok: true } & T) | { ok: false; error: ApiError };

export const SOCKET_NAMESPACE = "/live";

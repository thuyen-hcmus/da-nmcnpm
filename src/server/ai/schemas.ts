import { z } from "zod";

/** Schema đầu ra AI — mọi phản hồi đều được validate lại bằng zod trước khi lưu (constitution III). */
export const aiSlide = z.object({
  template: z.enum(["TITLE", "CONTENT"]),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(5000).default(""),
  notes: z.string().max(5000).default(""),
});
export const aiSlides = z.object({ slides: z.array(aiSlide).min(1).max(20) });

export const aiSuggestion = z.object({
  title: z.string().max(200).optional(),
  body: z.string().max(5000).optional(),
  notes: z.string().max(5000).optional(),
});

export const aiQuestion = z
  .object({
    prompt: z.string().trim().min(1).max(500),
    options: z.array(z.string().trim().min(1).max(200)).min(2).max(6),
    correctIndex: z.number().int().min(0),
    explanation: z.string().max(1000).default(""),
    sourceSlideNumbers: z.array(z.number().int().min(1)).default([]),
  })
  .refine((q) => q.correctIndex < q.options.length, "correctIndex ngoài phạm vi")
  .refine((q) => new Set(q.options.map((o) => o.toLowerCase())).size === q.options.length, "lựa chọn trùng");
export const aiQuiz = z.object({ questions: z.array(aiQuestion).min(1).max(5) });

export type AiSlide = z.infer<typeof aiSlide>;
export type AiSuggestion = z.infer<typeof aiSuggestion>;
export type AiQuestion = z.infer<typeof aiQuestion>;

/** JSON schema mô tả cấu trúc đầu ra gửi cho nhà cung cấp AI. */
export const jsonSchemas = {
  slides: {
    type: "object",
    properties: {
      slides: {
        type: "array",
        items: {
          type: "object",
          properties: {
            template: { type: "string", enum: ["TITLE", "CONTENT"] },
            title: { type: "string" },
            body: { type: "string", description: "Các ý, mỗi ý một dòng, phân tách bằng \\n" },
            notes: { type: "string", description: "Ghi chú thuyết trình cho giảng viên" },
          },
          required: ["template", "title", "body", "notes"],
        },
      },
    },
    required: ["slides"],
  },
  suggestion: {
    type: "object",
    properties: { title: { type: "string" }, body: { type: "string" }, notes: { type: "string" } },
  },
  quiz: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            prompt: { type: "string" },
            options: { type: "array", items: { type: "string" } },
            correctIndex: { type: "integer" },
            explanation: { type: "string" },
            sourceSlideNumbers: { type: "array", items: { type: "integer" } },
          },
          required: ["prompt", "options", "correctIndex", "explanation", "sourceSlideNumbers"],
        },
      },
    },
    required: ["questions"],
  },
} as const;

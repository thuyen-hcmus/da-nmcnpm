/**
 * Tầng dịch vụ gọi nhà cung cấp AI đã cấu hình qua cùng một interface.
 */
export type JsonKind = "slides" | "suggestion" | "quiz";

export interface AiProvider {
  readonly name: string;
  /** Gửi prompt, nhận JSON thô (chưa validate). Ném lỗi khi mạng/timeout. */
  generateJson(kind: JsonKind, system: string, prompt: string, signal: AbortSignal): Promise<unknown>;
}

export class BadOutputError extends Error {}

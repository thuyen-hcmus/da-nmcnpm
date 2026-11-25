/**
 * Lớp trừu tượng AI: đúng MỘT nhà cung cấp (Gemini) trong vận hành; FakeAiProvider cho test và demo
 * dự phòng khi mất Internet. Tầng dịch vụ chỉ biết interface này.
 */
export type JsonKind = "slides" | "suggestion" | "quiz";

export interface AiProvider {
  readonly name: string;
  /** Gửi prompt, nhận JSON thô (chưa validate). Ném lỗi khi mạng/timeout. */
  generateJson(kind: JsonKind, system: string, prompt: string, signal: AbortSignal): Promise<unknown>;
}

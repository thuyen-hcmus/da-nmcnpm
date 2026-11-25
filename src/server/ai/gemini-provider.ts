import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { AiProvider, JsonKind } from "./provider";
import { geminiSchemas } from "./schemas";

export class GeminiProvider implements AiProvider {
  readonly name = "gemini";
  private client: GoogleGenAI;

  constructor(
    apiKey: string,
    private model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateJson(kind: JsonKind, system: string, prompt: string, signal: AbortSignal): Promise<unknown> {
    const res = await this.client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        responseSchema: geminiSchemas[kind] as never,
        temperature: 0.6,
        // soạn slide/quiz không cần suy luận dài; giảm độ trễ để nằm trong giới hạn 30 giây
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        abortSignal: signal,
      },
    });
    const text = res.text;
    if (!text) throw new BadOutputError("empty response");
    try {
      return JSON.parse(text);
    } catch {
      throw new BadOutputError("invalid json");
    }
  }
}

export class BadOutputError extends Error {}

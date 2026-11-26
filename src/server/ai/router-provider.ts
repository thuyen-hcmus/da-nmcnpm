import { BadOutputError, type AiProvider, type JsonKind } from "./provider";
import { jsonSchemas } from "./schemas";

export class RouterProvider implements AiProvider {
  readonly name = "9router";
  private endpoint: URL;

  constructor(
    baseUrl: URL,
    private apiKey: string,
    private model: string,
  ) {
    this.endpoint = new URL(baseUrl);
    this.endpoint.pathname = baseUrl.pathname.replace(/\/+$/, "") + "/chat/completions";
  }

  async generateJson(kind: JsonKind, system: string, prompt: string, signal: AbortSignal): Promise<unknown> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: `${system}\nJSON schema:\n${JSON.stringify(jsonSchemas[kind])}` },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        stream: false,
      }),
      redirect: "error",
      signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new RouterRequestError(response.status);
    }

    const result: { choices?: Array<{ message?: { content?: unknown } }> } = await response.json();
    const content = result?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new BadOutputError("empty response");
    }
    try {
      return JSON.parse(content);
    } catch {
      throw new BadOutputError("invalid json");
    }
  }
}

class RouterRequestError extends Error {
  constructor(readonly status: number) {
    super(`9Router HTTP ${status}`);
  }
}

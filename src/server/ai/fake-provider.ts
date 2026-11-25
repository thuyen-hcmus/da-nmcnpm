import type { AiProvider, JsonKind } from "./provider";

/**
 * Nhà cung cấp giả lập, xác định (deterministic): dùng cho test tự động và demo không có Internet
 * (AI_PROVIDER=fake). Có thể ép lỗi bằng cách đặt `FakeAiProvider.mode`.
 */
export class FakeAiProvider implements AiProvider {
  readonly name = "fake";
  static mode: "ok" | "timeout" | "bad" | "error" = "ok";

  async generateJson(kind: JsonKind, _system: string, prompt: string, signal: AbortSignal): Promise<unknown> {
    if (FakeAiProvider.mode === "timeout") {
      await new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted"))));
    }
    if (FakeAiProvider.mode === "error") throw new Error("upstream 500");
    if (FakeAiProvider.mode === "bad") return { nope: true };
    await new Promise((r) => setTimeout(r, 150));

    if (kind === "slides") {
      const n = Number(/SỐ_SLIDE=(\d+)/.exec(prompt)?.[1] ?? 4);
      const topic = /CHỦ_ĐỀ=(.*)/.exec(prompt)?.[1]?.trim() ?? "Chủ đề";
      return {
        slides: Array.from({ length: n }, (_, i) =>
          i === 0
            ? { template: "TITLE", title: topic, body: "Bài giảng nháp do AI tạo", notes: "Giới thiệu chủ đề và mục tiêu buổi học." }
            : {
                template: "CONTENT",
                title: `Ý chính ${i}`,
                body: `Điểm ${i}.1 về ${topic}\nĐiểm ${i}.2 cần nhấn mạnh\nVí dụ minh họa ${i}`,
                notes: `Gợi ý: giải thích ý chính ${i} kèm ví dụ thực tế.`,
              },
        ),
      };
    }
    if (kind === "suggestion") {
      return { title: "Tiêu đề đã được AI viết lại", body: "Ý ngắn gọn thứ nhất\nÝ ngắn gọn thứ hai", notes: "Ghi chú gợi ý từ AI." };
    }
    const nums = [...prompt.matchAll(/\[Slide (\d+)\]/g)].map((m) => Number(m[1]));
    const count = Number(/SỐ_CÂU=(\d+)/.exec(prompt)?.[1] ?? 1);
    return {
      questions: Array.from({ length: count }, (_, i) => ({
        prompt: `Câu hỏi ${i + 1}: Nhìn thấy ghế trống có nghĩa là đã giữ được ghế không?`,
        options: ["Có", "Không"],
        correctIndex: 1,
        explanation: "Nhìn thấy chỉ là đọc dữ liệu; giữ ghế cần server xác nhận.",
        sourceSlideNumbers: nums.length ? [nums[0]] : [],
      })),
    };
  }
}

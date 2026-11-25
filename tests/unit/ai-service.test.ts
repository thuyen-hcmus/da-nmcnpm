import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { callAi, generateQuiz, generateSlides, setProvider } from "@/server/ai/ai-service";
import { FakeAiProvider } from "@/server/ai/fake-provider";
import { aiSlides } from "@/server/ai/schemas";
import { makeLecture, makeLecturer } from "../helpers";

afterEach(() => {
  FakeAiProvider.mode = "ok";
  setProvider(null);
});

describe("AI – lớp trừu tượng và xử lý lỗi (FR-024)", () => {
  it("timeout → AI_TIMEOUT", async () => {
    FakeAiProvider.mode = "timeout";
    await expect(callAi("slides", "x", aiSlides, 200)).rejects.toMatchObject({ code: "AI_TIMEOUT" });
  });

  it("sai định dạng → AI_BAD_OUTPUT", async () => {
    FakeAiProvider.mode = "bad";
    await expect(callAi("slides", "x", aiSlides)).rejects.toMatchObject({ code: "AI_BAD_OUTPUT" });
  });

  it("lỗi dịch vụ → AI_ERROR sau khi thử lại", async () => {
    FakeAiProvider.mode = "error";
    let calls = 0;
    const base = new FakeAiProvider();
    setProvider({ name: "count", generateJson: (...a) => (calls++, base.generateJson(...a)) });
    await expect(callAi("slides", "x", aiSlides)).rejects.toMatchObject({ code: "AI_ERROR" });
    expect(calls).toBe(3);
  }, 15000);

  it("AI lỗi không làm thay đổi slide hiện có", async () => {
    const { user } = await makeLecturer();
    const { lecture } = await makeLecture(user.id, 3);
    FakeAiProvider.mode = "bad";
    await expect(generateSlides(user.id, lecture.id, { topic: "TicketBox", audience: "SV", slideCount: 4 })).rejects.toBeTruthy();
    expect(await db.slide.count({ where: { lectureId: lecture.id } })).toBe(3);
  });
});

describe("AI – nội dung luôn là nháp (FR-020, FR-022, FR-023)", () => {
  it("tạo đúng số slide nháp từ ý tưởng", async () => {
    const { user } = await makeLecturer();
    const lecture = await db.lecture.create({ data: { ownerId: user.id, title: "Trống" } });
    const slides = await generateSlides(user.id, lecture.id, { topic: "Hai người cùng đặt một ghế", audience: "SV", slideCount: 6 });
    expect(slides).toHaveLength(6);
    expect(slides.every((s) => s.isAiDraft && s.source === "AI")).toBe(true);
    expect(slides[0].template).toBe("TITLE");
  });

  it("quiz AI là DRAFT, có slide căn cứ, không mở được trong phiên khi chưa duyệt", async () => {
    const { user } = await makeLecturer();
    const { lecture, slides } = await makeLecture(user.id);
    const qs = await generateQuiz(user.id, lecture.id, { slideIds: [slides[3].id], count: 2 });
    expect(qs).toHaveLength(2);
    for (const q of qs) {
      expect(q.status).toBe("DRAFT");
      expect(q.source).toBe("AI");
      expect(q.sourceSlideIds).toEqual([slides[3].id]);
    }
  });

  it("giảng viên khác không gọi AI trên bài giảng không phải của mình", async () => {
    const a = await makeLecturer();
    const b = await makeLecturer();
    const { lecture } = await makeLecture(a.user.id);
    await expect(generateSlides(b.user.id, lecture.id, { topic: "abc", audience: "SV", slideCount: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

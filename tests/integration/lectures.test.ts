import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  deleteLecture,
  duplicateLecture,
  getLectureDetail,
  insertSlides,
  reorderSlides,
  updateSlide,
} from "@/server/services/lecture-service";
import { approveQuestion, createQuestionForUser, updateQuestion } from "@/server/services/question-service";
import { createSession, joinSession } from "@/server/services/session-service";
import { sessionReport } from "@/server/services/report-service";
import { makeLecture, makeLecturer } from "../helpers";

describe("US5 – bài giảng, slide, câu hỏi", () => {
  it("chèn slide giữa và sắp xếp lại giữ thứ tự liên tục", async () => {
    const { user } = await makeLecturer();
    const { lecture, slides } = await makeLecture(user.id, 3);
    await insertSlides(lecture.id, [{ template: "CONTENT", title: "Chèn", body: "", notes: "", source: "MANUAL", isAiDraft: false }], 1);
    let d = await getLectureDetail(user.id, lecture.id);
    expect(d.slides.map((s) => s.title)).toEqual(["Slide 1", "Chèn", "Slide 2", "Slide 3"]);
    await reorderSlides(user.id, lecture.id, [...d.slides].reverse().map((s) => s.id));
    d = await getLectureDetail(user.id, lecture.id);
    expect(d.slides.map((s) => s.position)).toEqual([0, 1, 2, 3]);
    expect(d.slides[0].title).toBe("Slide 3");
    await expect(reorderSlides(user.id, lecture.id, [slides[0].id])).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("giảng viên A không xem/sửa được bài giảng của B (FR-002)", async () => {
    const a = await makeLecturer();
    const b = await makeLecturer();
    const { lecture, slides } = await makeLecture(a.user.id);
    await expect(getLectureDetail(b.user.id, lecture.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateSlide(b.user.id, slides[0].id, { title: "hack" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createSession(b.user.id, lecture.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("sửa câu đã duyệt đưa về nháp; validation lựa chọn (FR-030)", async () => {
    const { user } = await makeLecturer();
    const { lecture } = await makeLecture(user.id);
    const q = await createQuestionForUser(user.id, lecture.id, { prompt: "Q?", options: ["A", "B"], correctIndex: 0, explanation: "", sourceSlideIds: [] });
    expect(q.status).toBe("DRAFT");
    expect((await approveQuestion(user.id, q.id)).status).toBe("APPROVED");
    expect((await updateQuestion(user.id, q.id, { correctIndex: 1 })).status).toBe("DRAFT");
    await expect(updateQuestion(user.id, q.id, { options: ["A"] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(updateQuestion(user.id, q.id, { options: ["A", "a"] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(updateQuestion(user.id, q.id, { correctIndex: 5 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("nhân bản chép slide + câu hỏi, không chép phiên; xóa khi có phiên LIVE → CONFLICT", async () => {
    const { user } = await makeLecturer();
    const { lecture } = await makeLecture(user.id, 4);
    await createSession(user.id, lecture.id);
    const copy = await duplicateLecture(user.id, lecture.id);
    const d = await getLectureDetail(user.id, copy.id);
    expect(d.slides).toHaveLength(4);
    expect(d.questions).toHaveLength(2);
    expect(d.questions.find((q) => q.status === "APPROVED")?.sourceSlideIds[0]).toBe(d.slides[3].id);
    expect(d.sessions).toHaveLength(0);
    await expect(deleteLecture(user.id, lecture.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await deleteLecture(user.id, copy.id);
  });

  it("không tạo phiên từ bài giảng rỗng", async () => {
    const { user } = await makeLecturer();
    const l = await db.lecture.create({ data: { ownerId: user.id, title: "Rỗng" } });
    await expect(createSession(user.id, l.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("Phiên – bản chụp, tham gia, báo cáo", () => {
  it("phiên dùng bản chụp: sửa bài giảng không đổi phiên đang chạy", async () => {
    const { user } = await makeLecturer();
    const { lecture, slides } = await makeLecture(user.id, 3);
    const { session } = await createSession(user.id, lecture.id);
    await updateSlide(user.id, slides[0].id, { title: "Đã sửa" });
    const ss = await db.sessionSlide.findFirstOrThrow({ where: { sessionId: session.id, index: 0 } });
    expect(ss.title).toBe("Slide 1");
  });

  it("tham gia lại bằng token cũ là cùng người; mã sai → NOT_FOUND", async () => {
    const { user } = await makeLecturer();
    const { lecture } = await makeLecture(user.id, 2);
    const { session } = await createSession(user.id, lecture.id);
    const a = await joinSession(session.code, { displayName: "An" });
    const again = await joinSession(session.code.toLowerCase(), { participantToken: a.participantToken });
    expect(again.participant.id).toBe(a.participant.id);
    const b = await joinSession(session.code, {});
    expect(b.participant.id).not.toBe(a.participant.id);
    expect(b.participant.displayName).toBeNull();
    await expect(joinSession("ZZZZZZ", {})).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("báo cáo chỉ chủ phiên xem được", async () => {
    const a = await makeLecturer();
    const b = await makeLecturer();
    const { lecture } = await makeLecture(a.user.id, 2);
    const { session } = await createSession(a.user.id, lecture.id);
    await joinSession(session.code, {});
    const r = await sessionReport(a.user.id, session.id);
    expect(r.participantCount).toBe(1);
    expect(r.reactions).toHaveLength(2);
    await expect(sessionReport(b.user.id, session.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

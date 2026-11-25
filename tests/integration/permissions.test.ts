import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectError, emit, findKeys, makeLecturer, nextState, setupLive, startServer, type Harness } from "../helpers";
import { db } from "@/server/db";
import { GET as getPublicSlide } from "@/app/api/s/[code]/slides/[index]/route";
import type { LecturerState, ProjectorState, StudentState } from "@/shared/contracts";

let h: Harness;
beforeAll(async () => {
  h = await startServer();
});
afterAll(async () => {
  await h.close();
});

const CONTROL: [string, (ids: { questionId: string; quizRunId: string; sqId: string }) => unknown][] = [
  ["slide:goto", () => ({ index: 5 })],
  ["qr:toggle", () => ({ show: false })],
  ["quiz:open", (x) => ({ questionId: x.questionId })],
  ["quiz:close", (x) => ({ quizRunId: x.quizRunId })],
  ["quiz:publish", (x) => ({ quizRunId: x.quizRunId })],
  ["quiz:hide", (x) => ({ quizRunId: x.quizRunId })],
  ["question:update", (x) => ({ questionId: x.sqId, spotlight: true })],
  ["session:end", () => ({})],
];

describe("US2 – tách quyền (kiểm thử trực tiếp socket, không qua giao diện)", () => {
  it("sinh viên và máy chiếu gửi mọi lệnh điều khiển → FORBIDDEN, trạng thái không đổi", async () => {
    const live = await setupLive(h, 1);
    await emit(live.lecturer, "quiz:open", { questionId: live.approved.id });
    const run = await db.quizRun.findFirstOrThrow({ where: { sessionId: live.session.id } });
    const sq = await emit<{ id: string }>(live.students[0].socket, "question:ask", { text: "Em hỏi" });
    const ids = { questionId: live.approved.id, quizRunId: run.id, sqId: sq.ok ? sq.id : "x" };
    const before = await db.session.findUniqueOrThrow({ where: { id: live.session.id } });

    for (const sock of [live.students[0].socket, live.projector]) {
      for (const [event, payload] of CONTROL) {
        const r = await emit(sock, event, payload(ids));
        expect(r.ok, `${event} phải bị từ chối`).toBe(false);
        if (!r.ok) expect(r.error.code).toBe("FORBIDDEN");
      }
    }
    const after = await db.session.findUniqueOrThrow({ where: { id: live.session.id } });
    expect(after.currentIndex).toBe(before.currentIndex);
    expect(after.status).toBe("LIVE");
    expect(after.stateVersion).toBe(before.stateVersion);
    expect((await db.quizRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe("OPEN");
  });

  it("máy chiếu không được nộp bài/đặt câu hỏi/gửi biểu cảm", async () => {
    const live = await setupLive(h, 0);
    for (const ev of ["quiz:answer", "question:ask", "reaction:set"]) {
      const r = await emit(live.projector, ev, { quizRunId: "x", optionIndex: 0, text: "x", slideIndex: 0, kind: "UNDERSTOOD" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.code).toBe("FORBIDDEN");
    }
  });

  it("giảng viên khác (không phải chủ phiên) không kết nối được với vai trò giảng viên", async () => {
    const live = await setupLive(h, 0);
    const other = await makeLecturer();
    const s = h.connect({ code: live.session.code, role: "lecturer" }, other.cookie);
    expect((await connectError(s)).code).toBe("FORBIDDEN");
  });

  it("token sai / thiếu → connect_error", async () => {
    const live = await setupLive(h, 0);
    expect((await connectError(h.connect({ code: live.session.code, role: "student", token: "sai" }))).code).toBe("UNAUTHENTICATED");
    expect((await connectError(h.connect({ code: live.session.code, role: "projector", token: "sai" }))).code).toBe("FORBIDDEN");
    expect((await connectError(h.connect({ code: live.session.code, role: "lecturer" }))).code).toBe("UNAUTHENTICATED");
    expect((await connectError(h.connect({ code: "KHONGCO", role: "student", token: "x" }))).code).toBe("NOT_FOUND");
  });

  it("dữ liệu gửi tới sinh viên/máy chiếu không chứa ghi chú, dàn ý, đáp án, slide chưa công bố (FR-045, SC-002)", async () => {
    const live = await setupLive(h, 1);
    await emit(live.lecturer, "slide:goto", { index: 3 });
    const sWait = nextState<StudentState>(live.students[0].socket, (s) => s.activeQuiz !== null);
    const pWait = nextState<ProjectorState>(live.projector, (s) => s.activeQuiz !== null);
    await emit(live.lecturer, "quiz:open", { questionId: live.approved.id });
    const [st, pj] = await Promise.all([sWait, pWait]);

    for (const payload of [st, pj]) {
      expect(findKeys(payload, ["notes", "outline", "correctIndex", "explanation", "counts", "result"])).toEqual([]);
      const raw = JSON.stringify(payload);
      expect(raw).not.toContain("GHI_CHU_RIENG");
      expect(raw).not.toContain("Dàn ý bí mật");
      expect(raw).not.toContain("GIAI_THICH_BI_MAT");
      expect(raw).not.toContain("Slide 5");
      expect(raw).not.toContain("Slide 6");
    }
    expect(st.slides.every((s) => s.index <= 3)).toBe(true);
  });

  it("giảng viên vẫn nhận ghi chú và đáp án (để đối chiếu)", async () => {
    const live = await setupLive(h, 0);
    const w = nextState<LecturerState>(live.lecturer, (s) => s.activeQuiz !== null);
    await emit(live.lecturer, "quiz:open", { questionId: live.approved.id });
    const st = await w;
    expect(st.slides[0].notes).toBe("GHI_CHU_RIENG_1");
    expect(st.activeQuiz?.correctIndex).toBe(1);
  });

  it("REST: slide chưa công bố → 403; slide đã công bố không có notes; không token → 401", async () => {
    const live = await setupLive(h, 1);
    await emit(live.lecturer, "slide:goto", { index: 2 });
    const call = (index: number, token?: string) =>
      getPublicSlide(new Request("http://x", { headers: token ? { authorization: `Bearer ${token}` } : {} }), {
        params: Promise.resolve({ code: live.session.code, index: String(index) }),
      });
    const tok = live.students[0].token;
    const ok = await call(2, tok);
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.notes).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("GHI_CHU_RIENG");
    expect((await call(3, tok)).status).toBe(403);
    expect((await call(5, tok)).status).toBe(403);
    expect((await call(0)).status).toBe(401);
  });

  it("sinh viên không gửi biểu cảm cho slide chưa công bố", async () => {
    const live = await setupLive(h, 1);
    const r = await emit(live.students[0].socket, "reaction:set", { slideIndex: 4, kind: "CONFUSED" });
    expect(r.ok).toBe(false);
  });
});

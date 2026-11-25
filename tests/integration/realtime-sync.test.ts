import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connected, emit, nextState, setupLive, startServer, type Harness } from "../helpers";
import { joinSession } from "@/server/services/session-service";
import type { LecturerState, ProjectorState, StudentState } from "@/shared/contracts";

let h: Harness;
beforeAll(async () => {
  h = await startServer();
});
afterAll(async () => {
  await h.close();
});

describe("US1 – đồng bộ ba giao diện", () => {
  it("giảng viên chuyển slide → máy chiếu và sinh viên nhận slide mới (FR-042, SC-001)", async () => {
    const live = await setupLive(h, 2);
    const waits = [
      nextState<ProjectorState>(live.projector, (s) => s.currentIndex === 3),
      ...live.students.map((s) => nextState<StudentState>(s.socket, (st) => st.currentIndex === 3)),
    ];
    const t0 = Date.now();
    const ack = await emit(live.lecturer, "slide:goto", { index: 3 });
    expect(ack.ok).toBe(true);
    const [proj, s1, s2] = await Promise.all(waits);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect((proj as ProjectorState).currentSlide?.title).toBe("Slide 4");
    expect((s1 as StudentState).slides.map((x) => x.index)).toEqual([0, 1, 2, 3]);
    expect((s2 as StudentState).maxPublishedIndex).toBe(3);
  });

  it("maxPublishedIndex không giảm khi quay lại slide trước (FR-044)", async () => {
    const live = await setupLive(h, 1);
    await emit(live.lecturer, "slide:goto", { index: 4 });
    const back = nextState<StudentState>(live.students[0].socket, (s) => s.currentIndex === 1);
    await emit(live.lecturer, "slide:goto", { index: 1 });
    const st = await back;
    expect(st.maxPublishedIndex).toBe(4);
    expect(st.slides).toHaveLength(5);
  });

  it("sinh viên vào muộn thấy đúng slide đang chiếu (rule 1)", async () => {
    const live = await setupLive(h, 0);
    await emit(live.lecturer, "slide:goto", { index: 3 });
    const j = await joinSession(live.session.code, {});
    const late = h.connect({ code: live.session.code, role: "student", token: j.participantToken });
    const st = await nextState<StudentState>(late);
    expect(st.currentIndex).toBe(3);
    expect(st.slides.map((s) => s.index)).toEqual([0, 1, 2, 3]);
  });

  it("mất kết nối rồi kết nối lại → nhận snapshot hiện tại (FR-043)", async () => {
    const live = await setupLive(h, 1);
    const stu = live.students[0];
    stu.socket.disconnect();
    await emit(live.lecturer, "slide:goto", { index: 5 });
    const again = nextState<StudentState>(stu.socket);
    stu.socket.connect();
    await connected(stu.socket);
    const st = await again;
    expect(st.currentIndex).toBe(5);
    // session:join cũng trả snapshot qua ack
    const ack = await emit<{ state: StudentState }>(stu.socket, "session:join");
    expect(ack.ok && ack.state.currentIndex).toBe(5);
  });

  it("stateVersion tăng đơn điệu sau mỗi lệnh", async () => {
    const live = await setupLive(h, 0);
    const a = await emit<{ v: number }>(live.lecturer, "slide:goto", { index: 1 });
    const b = await emit<{ v: number }>(live.lecturer, "slide:goto", { index: 2 });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.v).toBeGreaterThan(a.v);
  });

  it("hai cửa sổ giảng viên cùng phiên cùng nhận trạng thái", async () => {
    const live = await setupLive(h, 0);
    const second = h.connect({ code: live.session.code, role: "lecturer" }, live.cookie);
    await nextState(second);
    const w = nextState<LecturerState>(second, (s) => s.currentIndex === 2);
    await emit(live.lecturer, "slide:goto", { index: 2 });
    expect((await w).currentIndex).toBe(2);
  });

  it("slide ngoài phạm vi bị từ chối", async () => {
    const live = await setupLive(h, 0);
    const r = await emit(live.lecturer, "slide:goto", { index: 99 });
    expect(r.ok).toBe(false);
  });
});

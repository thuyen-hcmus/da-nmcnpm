import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { emit, findKeys, nextState, setupLive, startServer, type Harness } from "../helpers";
import { db } from "@/server/db";
import type { LecturerState, ProjectorState, StudentState } from "@/shared/contracts";

let h: Harness;
beforeAll(async () => {
  h = await startServer();
});
afterAll(async () => {
  await h.close();
});

async function openQuiz(live: Awaited<ReturnType<typeof setupLive>>) {
  const r = await emit(live.lecturer, "quiz:open", { questionId: live.approved.id });
  expect(r.ok).toBe(true);
  return db.quizRun.findFirstOrThrow({ where: { sessionId: live.session.id, status: "OPEN" } });
}

describe("US3 – vòng đời quiz", () => {
  it("câu nháp không mở được (FR-030)", async () => {
    const live = await setupLive(h, 0);
    const r = await emit(live.lecturer, "quiz:open", { questionId: live.draft.id });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("CONFLICT");
  });

  it("tối đa 1 quiz đang mở mỗi phiên", async () => {
    const live = await setupLive(h, 0);
    await openQuiz(live);
    const r = await emit(live.lecturer, "quiz:open", { questionId: live.approved.id });
    expect(r.ok).toBe(false);
  });

  it("Mở → nộp → đóng → công bố; kết quả chỉ hiện khi công bố (FR-035, FR-036)", async () => {
    const live = await setupLive(h, 2);
    const run = await openQuiz(live);
    const [a, b] = live.students;

    const lecWait = new Promise<{ total: number }>((resolve) =>
      live.lecturer.on("session:delta:lecturer", (d: { activeQuiz: { total: number } | null }) => {
        if (d.activeQuiz?.total === 2) resolve(d.activeQuiz);
      }),
    );
    expect((await emit(a.socket, "quiz:answer", { quizRunId: run.id, optionIndex: 0 })).ok).toBe(true);
    expect((await emit(b.socket, "quiz:answer", { quizRunId: run.id, optionIndex: 1 })).ok).toBe(true);
    expect((await lecWait).total).toBe(2);

    // công bố khi đang mở → CONFLICT
    const early = await emit(live.lecturer, "quiz:publish", { quizRunId: run.id });
    expect(early.ok).toBe(false);

    const closedState = nextState<StudentState>(a.socket, (s) => s.activeQuiz?.status === "CLOSED");
    expect((await emit(live.lecturer, "quiz:close", { quizRunId: run.id })).ok).toBe(true);
    const cs = await closedState;
    expect(findKeys(cs, ["result", "counts", "correctIndex"])).toEqual([]);
    expect(cs.me.answeredOptionIndex).toBe(0);

    const projPub = nextState<ProjectorState>(live.projector, (s) => s.activeQuiz?.status === "PUBLISHED");
    const stuPub = nextState<StudentState>(b.socket, (s) => s.activeQuiz?.status === "PUBLISHED");
    expect((await emit(live.lecturer, "quiz:publish", { quizRunId: run.id })).ok).toBe(true);
    const pj = await projPub;
    expect(pj.activeQuiz?.result).toEqual({ counts: [1, 1], total: 2, correctIndex: 1, explanation: "GIAI_THICH_BI_MAT" });
    const sb = await stuPub;
    expect(sb.activeQuiz?.result?.correctIndex).toBe(1);
    expect(sb.me.answeredOptionIndex).toBe(1);
  });

  it("20 lượt nộp đồng thời từ cùng sinh viên → đúng 1 lượt được tính (SC-003)", async () => {
    const live = await setupLive(h, 1);
    const run = await openQuiz(live);
    const s = live.students[0].socket;
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => emit(s, "quiz:answer", { quizRunId: run.id, optionIndex: i % 2 })),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const rejected = results.filter((r) => !r.ok);
    expect(rejected.every((r) => !r.ok && r.error.code === "ALREADY_ANSWERED")).toBe(true);
    expect(await db.answer.count({ where: { quizRunId: run.id } })).toBe(1);
  });

  it("nộp sau khi đóng quiz → QUIZ_CLOSED, không được ghi", async () => {
    const live = await setupLive(h, 1);
    const run = await openQuiz(live);
    await emit(live.lecturer, "quiz:close", { quizRunId: run.id });
    const r = await emit(live.students[0].socket, "quiz:answer", { quizRunId: run.id, optionIndex: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("QUIZ_CLOSED");
    expect(await db.answer.count({ where: { quizRunId: run.id } })).toBe(0);
  });

  it("kết thúc phiên đóng quiz đang mở và từ chối phản hồi", async () => {
    const live = await setupLive(h, 1);
    const run = await openQuiz(live);
    const ended = nextState<StudentState>(live.students[0].socket, (s) => s.status === "ENDED");
    expect((await emit(live.lecturer, "session:end")).ok).toBe(true);
    await ended;
    expect((await db.quizRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe("CLOSED");
    const r = await emit(live.students[0].socket, "question:ask", { text: "còn hỏi được không?" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("SESSION_ENDED");
  });
});

describe("US3 – câu hỏi và biểu cảm", () => {
  it("câu hỏi sinh viên chỉ tới giảng viên; chiếu cho cả lớp mới lên máy chiếu (FR-051)", async () => {
    const live = await setupLive(h, 2);
    let otherGotIt = false;
    live.students[1].socket.on("session:state", (s: StudentState) => {
      if (JSON.stringify(s).includes("Vì sao A5")) otherGotIt = true;
    });
    const lec = new Promise<string>((resolve) =>
      live.lecturer.on("session:delta:lecturer", (d: LecturerState) => {
        const q = d.questions.find((x) => x.text === "Vì sao A5 lại trống?");
        if (q) resolve(q.id);
      }),
    );
    const ask = await emit<{ id: string }>(live.students[0].socket, "question:ask", { text: "Vì sao A5 lại trống?" });
    expect(ask.ok).toBe(true);
    const qid = await lec;

    const projBefore = (await emit<{ state: ProjectorState }>(live.projector, "session:join")) as { ok: true; state: ProjectorState };
    expect(projBefore.state.spotlightQuestion).toBeNull();

    const projWait = nextState<ProjectorState>(live.projector, (s) => s.spotlightQuestion !== null);
    expect((await emit(live.lecturer, "question:update", { questionId: qid, spotlight: true })).ok).toBe(true);
    expect((await projWait).spotlightQuestion).toEqual({ text: "Vì sao A5 lại trống?", displayName: "SV1" });
    expect(otherGotIt).toBe(false);
  });

  it("biểu cảm: đổi từ 'chưa rõ' sang 'hiểu' tính 1 lần (FR-052, FR-053)", async () => {
    const live = await setupLive(h, 2);
    const [a, b] = live.students;
    await emit(a.socket, "reaction:set", { slideIndex: 0, kind: "CONFUSED" });
    await emit(a.socket, "reaction:set", { slideIndex: 0, kind: "UNDERSTOOD" });
    await emit(b.socket, "reaction:set", { slideIndex: 0, kind: "CONFUSED" });
    await new Promise((r) => setTimeout(r, 350));
    const st = (await emit<{ state: LecturerState }>(live.lecturer, "session:join")) as { ok: true; state: LecturerState };
    expect(st.state.reactions).toEqual({ slideIndex: 0, understood: 1, confused: 1 });
    const me = (await emit<{ state: StudentState }>(a.socket, "session:join")) as { ok: true; state: StudentState };
    expect(me.state.me.reactionForCurrent).toBe("UNDERSTOOD");
  });

  it("câu hỏi rỗng hoặc > 500 ký tự bị từ chối", async () => {
    const live = await setupLive(h, 1);
    expect((await emit(live.students[0].socket, "question:ask", { text: "  " })).ok).toBe(false);
    expect((await emit(live.students[0].socket, "question:ask", { text: "x".repeat(501) })).ok).toBe(false);
  });
});

"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SlideView } from "@/client/components/SlideView";
import { QuizChart } from "@/client/components/QuizChart";
import { ConnectionBanner, CONNECT_ERRORS } from "@/client/components/ConnectionBanner";
import { useSessionSocket } from "@/client/realtime/useSessionSocket";
import type { LecturerDelta, LecturerState } from "@/shared/contracts";

export function Presenter({ sessionId, code, lectureId }: { sessionId: string; code: string; lectureId: string }) {
  const router = useRouter();
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"questions" | "outline">("questions");
  const onDelta = useCallback((d: LecturerDelta) => {
    setState((s) => {
      if (!s) return s;
      const activeQuiz = s.activeQuiz && d.activeQuiz && d.activeQuiz.id === s.activeQuiz.id ? { ...s.activeQuiz, counts: d.activeQuiz.counts, total: d.activeQuiz.total } : s.activeQuiz;
      return { ...s, participantCount: d.participantCount, reactions: d.reactions, questions: d.questions, activeQuiz };
    });
  }, []);
  const { state, setState, status, error, send } = useSessionSocket<LecturerState>({ code, role: "lecturer", onDelta });

  const run = useCallback(
    async (event: string, payload: unknown = {}) => {
      const r = await send(event, payload);
      if (!r.ok) setToast(r.error.message);
      return r;
    },
    [send],
  );

  // Nhấn nhanh nhiều lần: tính từ slide vừa yêu cầu, không đợi snapshot về
  const pendingRef = useRef<number | null>(null);
  useEffect(() => {
    pendingRef.current = null;
  }, [state?.v]);
  const goto = useCallback(
    (i: number) => {
      if (!state) return;
      if (i < 0 || i >= state.slideCount) return;
      pendingRef.current = i;
      void run("slide:goto", { index: i });
    },
    [state, run],
  );
  const step = useCallback(
    (d: 1 | -1) => {
      if (!state) return;
      goto((pendingRef.current ?? state.currentIndex) + d);
    },
    [state, goto],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      if (!state) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        step(-1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, step]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (state?.status === "ENDED") router.replace(`/sessions/${sessionId}/report`);
  }, [state?.status, router, sessionId]);

  if (error) return <p className="p-8 text-center text-bad">{CONNECT_ERRORS[error] ?? error}</p>;
  if (!state) return <p className="p-8 text-center text-slate-500">Đang tải phiên…</p>;

  const current = state.slides[state.currentIndex];
  const next = state.slides[state.currentIndex + 1];
  const quiz = state.activeQuiz;
  const linkedQuestionId = current?.template === "QUIZ" ? current.quizQuestionId : null;
  const totalReact = state.reactions.understood + state.reactions.confused;
  const newQuestions = state.questions.filter((q) => q.status === "NEW").length;

  async function endSession() {
    if (!confirm("Kết thúc phiên? Sinh viên sẽ không gửi phản hồi được nữa.")) return;
    await run("session:end");
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-100">
      <ConnectionBanner status={status} />
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <Link href={`/lectures/${lectureId}/edit`} className="btn-ghost">← Bài giảng</Link>
        <h1 className="min-w-0 flex-1 truncate font-semibold">{state.lectureTitle}</h1>
        <span className="badge bg-slate-100 text-slate-700">Mã phiên: <b className="ml-1 tracking-widest">{state.code}</b></span>
        <span className="badge bg-blue-100 text-brand">{state.participantCount} sinh viên</span>
        <a className="btn-secondary" href={state.projectorUrl} target="_blank" rel="noopener">Mở màn hình chiếu ↗</a>
        <button className="btn-danger" onClick={endSession}>Kết thúc phiên</button>
      </header>

      <main className="grid flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div>
              <p className="mb-1 text-xs font-medium uppercase text-slate-500">Đang chiếu · slide {state.currentIndex + 1}/{state.slideCount}</p>
              {current && <SlideView slide={current} size="lg" className="border-4 border-brand shadow" />}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase text-slate-500">Slide kế tiếp</p>
              {next ? <SlideView slide={next} size="sm" className="border border-slate-200 opacity-80" /> : <div className="card flex aspect-video items-center justify-center text-sm text-slate-400">Hết bài</div>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary" onClick={() => step(-1)} disabled={state.currentIndex === 0}>← Trước</button>
            <button className="btn-primary" onClick={() => step(1)} disabled={state.currentIndex >= state.slideCount - 1}>Tiếp →</button>
            <span className="text-xs text-slate-500">Phím ← → để chuyển slide</span>
            <div className="ml-auto flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={state.showJoinQr} onChange={(e) => run("qr:toggle", { show: e.target.checked })} />
                Hiện QR trên máy chiếu
              </label>
            </div>
          </div>

          <div className="card p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-700">Ghi chú riêng (chỉ bạn thấy)</h2>
            <p className="whitespace-pre-wrap text-sm text-slate-800">{current?.notes || <span className="text-slate-400">Không có ghi chú</span>}</p>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2" aria-label="Danh sách slide">
            {state.slides.map((s) => (
              <button key={s.index} onClick={() => goto(s.index)} className={`w-36 shrink-0 rounded-lg border-2 text-left ${s.index === state.currentIndex ? "border-brand" : s.index <= state.maxPublishedIndex ? "border-slate-300" : "border-dashed border-slate-300 opacity-60"}`} title={s.index > state.maxPublishedIndex ? "Chưa công bố" : undefined}>
                <SlideView slide={s} size="sm" />
                <span className="block px-2 py-1 text-xs text-slate-600">{s.index + 1}. {s.title}</span>
              </button>
            ))}
          </div>
        </section>

        <aside className="space-y-4">
          <div className="card space-y-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Mức độ hiểu bài (slide {state.reactions.slideIndex + 1})</h2>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-green-50 p-3">
                <p className="text-3xl font-bold text-ok tabular-nums">{state.reactions.understood}</p>
                <p className="text-xs text-slate-600">Em hiểu</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3">
                <p className="text-3xl font-bold text-warn tabular-nums">{state.reactions.confused}</p>
                <p className="text-xs text-slate-600">Em chưa rõ</p>
              </div>
            </div>
            {totalReact > 0 && state.reactions.confused / totalReact >= 0.4 && (
              <p className="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">Nhiều bạn chưa rõ, cân nhắc dừng lại giải thích.</p>
            )}
          </div>

          <div className="card space-y-3 p-4">
            <h2 className="font-semibold">Quiz</h2>
            {quiz ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">{quiz.prompt}</p>
                <span className={`badge ${quiz.status === "OPEN" ? "bg-green-100 text-ok" : quiz.status === "CLOSED" ? "bg-slate-200 text-slate-700" : "bg-blue-100 text-brand"}`}>
                  {quiz.status === "OPEN" ? "Đang mở" : quiz.status === "CLOSED" ? "Đã đóng (lớp chưa thấy kết quả)" : "Đã công bố"}
                </span>
                <p className="text-sm text-slate-600">{quiz.total} / {state.participantCount} sinh viên đã nộp</p>
                <QuizChart options={quiz.options} counts={quiz.counts} correctIndex={quiz.correctIndex} />
                <div className="flex flex-wrap gap-2">
                  {quiz.status === "OPEN" && <button className="btn-primary" onClick={() => run("quiz:close", { quizRunId: quiz.id })}>Đóng quiz</button>}
                  {quiz.status === "CLOSED" && <button className="btn-primary" onClick={() => run("quiz:publish", { quizRunId: quiz.id })}>Công bố kết quả lên màn chiếu</button>}
                  {quiz.status !== "OPEN" && <button className="btn-ghost" onClick={() => run("quiz:hide", { quizRunId: quiz.id })}>Gỡ khỏi màn chiếu</button>}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Chưa mở quiz nào.</p>
            )}
            {(!quiz || quiz.status !== "OPEN") && (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                <p className="text-xs font-medium uppercase text-slate-500">Câu đã duyệt</p>
                {state.approvedQuestions.length === 0 && <p className="text-sm text-slate-500">Chưa có câu hỏi nào được duyệt. Vào trang soạn bài để tạo và duyệt.</p>}
                <ul className="space-y-2">
                  {state.approvedQuestions.map((q) => (
                    <li key={q.id} className={`flex items-start gap-2 rounded-lg border p-2 text-sm ${q.id === linkedQuestionId ? "border-brand bg-blue-50" : "border-slate-200"}`}>
                      <span className="flex-1">{q.prompt}</span>
                      <button className="btn-secondary shrink-0 px-2 py-1" onClick={() => run("quiz:open", { questionId: q.id })}>Mở quiz</button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="card p-4">
            <div className="mb-3 flex gap-2">
              <button className={`btn-ghost ${tab === "questions" ? "bg-slate-100" : ""}`} onClick={() => setTab("questions")}>
                Câu hỏi của lớp {newQuestions > 0 && <span className="badge bg-bad text-white">{newQuestions}</span>}
              </button>
              <button className={`btn-ghost ${tab === "outline" ? "bg-slate-100" : ""}`} onClick={() => setTab("outline")}>Dàn ý</button>
            </div>
            {tab === "outline" ? (
              <p className="whitespace-pre-wrap text-sm">{state.outline || <span className="text-slate-400">Chưa có dàn ý</span>}</p>
            ) : state.questions.length === 0 ? (
              <p className="text-sm text-slate-500">Chưa có câu hỏi nào. Câu hỏi sinh viên chỉ hiện ở đây cho tới khi bạn chọn chiếu.</p>
            ) : (
              <ul className="max-h-96 space-y-2 overflow-y-auto">
                {state.questions.map((q) => {
                  const spot = state.spotlightQuestionId === q.id;
                  return (
                    <li key={q.id} className={`rounded-lg border p-2 text-sm ${spot ? "border-brand bg-blue-50" : q.status === "NEW" ? "border-slate-300" : "border-slate-100 opacity-60"}`}>
                      <p>{q.text}</p>
                      <p className="mt-1 text-xs text-slate-500">{q.displayName ?? "Ẩn danh"} · {new Date(q.createdAt).toLocaleTimeString("vi-VN")}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => run("question:update", { questionId: q.id, spotlight: !spot })}>{spot ? "Ngừng chiếu" : "Chiếu cho cả lớp"}</button>
                        {q.status !== "ANSWERED" && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => run("question:update", { questionId: q.id, status: "ANSWERED" })}>Đã trả lời</button>}
                        {q.status !== "HIDDEN" && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => run("question:update", { questionId: q.id, status: "HIDDEN" })}>Ẩn</button>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <JoinBox sessionId={sessionId} joinUrl={state.joinUrl} code={state.code} />
        </aside>
      </main>
      {toast && <div role="alert" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
    </div>
  );
}

function JoinBox({ sessionId, joinUrl, code }: { sessionId: string; joinUrl: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="card flex items-center gap-3 p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/sessions/${sessionId}/join-qr`} alt={`QR tham gia phiên ${code}`} className="h-24 w-24" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs text-slate-500">Link tham gia</p>
        <p className="truncate text-sm font-medium">{joinUrl}</p>
        <button
          className="btn-secondary px-2 py-1 text-xs"
          onClick={() => {
            navigator.clipboard?.writeText(joinUrl).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? "Đã sao chép" : "Sao chép link"}
        </button>
      </div>
    </div>
  );
}

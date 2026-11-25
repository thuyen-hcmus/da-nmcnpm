"use client";
import { useEffect, useState } from "react";
import { SlideView } from "@/client/components/SlideView";
import { QuizChart } from "@/client/components/QuizChart";
import { ConnectionBanner, CONNECT_ERRORS } from "@/client/components/ConnectionBanner";
import { api, ApiCallError, errorMessage } from "@/client/lib/api";
import { useSessionSocket } from "@/client/realtime/useSessionSocket";
import type { StudentState } from "@/shared/contracts";

const storageKey = (code: string) => `ptk:${code}`;

function readToken(code: string) {
  try {
    return localStorage.getItem(storageKey(code));
  } catch {
    return null;
  }
}

/** Trang sinh viên: vào phiên (ẩn danh hoặc tên hiển thị), rồi theo dõi bài giảng. */
export function Student({ code }: { code: string }) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [info, setInfo] = useState<{ status: string; lectureTitle: string } | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);

  useEffect(() => {
    setToken(readToken(code));
    api<{ status: string; lectureTitle: string }>(`/api/s/${code}`)
      .then(setInfo)
      .catch((e) => setInfoError(e instanceof ApiCallError && e.status === 404 ? CONNECT_ERRORS.NOT_FOUND : errorMessage(e)));
  }, [code]);

  if (infoError) return <Message>{infoError}</Message>;
  if (!info || token === undefined) return <Message>Đang tải…</Message>;
  if (info.status === "ENDED") return <Message>Phiên đã kết thúc. Cảm ơn bạn đã tham gia!</Message>;
  if (!token)
    return (
      <JoinForm
        code={code}
        title={info.lectureTitle}
        onJoined={(t) => {
          try {
            localStorage.setItem(storageKey(code), t);
          } catch {}
          setToken(t);
        }}
      />
    );
  return (
    <Live
      code={code}
      token={token}
      onInvalid={() => {
        try {
          localStorage.removeItem(storageKey(code));
        } catch {}
        setToken(null);
      }}
    />
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center p-6 text-center text-lg text-slate-700">{children}</main>;
}

function JoinForm({ code, title, onJoined }: { code: string; title: string; onJoined: (token: string) => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ participantToken: string }>(`/api/s/${code}/join`, { method: "POST", json: { displayName: name.trim() || undefined } });
      onJoined(r.participantToken);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={join} className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <p className="text-sm text-slate-500">Bạn đang vào phiên <b className="tracking-widest">{code}</b></p>
          <h1 className="mt-1 text-xl font-bold">{title}</h1>
        </div>
        <div>
          <label className="label" htmlFor="dn">Tên hiển thị (không bắt buộc)</label>
          <input id="dn" className="input text-base" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Để trống để tham gia ẩn danh" />
        </div>
        {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        <button className="btn-primary w-full py-3 text-base" disabled={busy}>{busy ? "Đang vào…" : "Vào lớp"}</button>
      </form>
    </main>
  );
}

function Live({ code, token, onInvalid }: { code: string; token: string; onInvalid: () => void }) {
  const { state, status, error, send } = useSessionSocket<StudentState>({ code, role: "student", token });
  const [viewIndex, setViewIndex] = useState<number | null>(null); // null = theo bài giảng
  const [msg, setMsg] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (error === "UNAUTHENTICATED") onInvalid();
  }, [error, onInvalid]);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3500);
    return () => clearTimeout(t);
  }, [msg]);

  if (error && error !== "UNAUTHENTICATED") return <Message>{CONNECT_ERRORS[error] ?? error}</Message>;
  if (!state) return <Message>Đang kết nối…</Message>;
  if (state.status === "ENDED") return <Message>Phiên đã kết thúc. Cảm ơn bạn đã tham gia!</Message>;

  const following = viewIndex === null || viewIndex === state.currentIndex;
  const shownIndex = following ? state.currentIndex : Math.min(viewIndex!, state.maxPublishedIndex);
  const slide = state.slides.find((s) => s.index === shownIndex);
  const quiz = state.activeQuiz;
  const my = state.me;

  async function answer(i: number) {
    if (!quiz) return;
    const r = await send("quiz:answer", { quizRunId: quiz.id, optionIndex: i });
    setMsg(r.ok ? "Đã nộp câu trả lời" : r.error.message);
  }
  async function react(kind: "UNDERSTOOD" | "CONFUSED") {
    const next = my.reactionForCurrent === kind ? null : kind;
    const r = await send("reaction:set", { slideIndex: state!.currentIndex, kind: next });
    if (!r.ok) setMsg(r.error.message);
  }
  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setSending(true);
    const r = await send("question:ask", { text: question });
    setSending(false);
    if (r.ok) {
      setQuestion("");
      setMsg("Đã gửi câu hỏi cho giảng viên");
    } else setMsg(r.error.message);
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 p-3 pb-6">
      <ConnectionBanner status={status} />
      <header className="flex items-center justify-between gap-2 pt-1">
        <p className="truncate text-sm font-semibold">{state.lectureTitle}</p>
        <span className="shrink-0 text-xs text-slate-500">{my.displayName ?? "Ẩn danh"}</span>
      </header>

      {quiz && (quiz.status === "OPEN" || my.answeredOptionIndex !== null || quiz.status === "PUBLISHED") && (
        <section className="card space-y-3 border-2 border-amber-300 p-4" aria-live="polite">
          <p className="text-xs font-semibold uppercase text-amber-700">
            {quiz.status === "OPEN" ? "Quiz đang mở" : quiz.status === "CLOSED" ? "Quiz đã đóng" : "Kết quả quiz"}
          </p>
          <p className="font-medium">{quiz.prompt}</p>
          {quiz.result ? (
            <>
              <QuizChart options={quiz.options} counts={quiz.result.counts} correctIndex={quiz.result.correctIndex} />
              {my.answeredOptionIndex !== null && (
                <p className={`text-sm font-semibold ${my.answeredOptionIndex === quiz.result.correctIndex ? "text-ok" : "text-bad"}`}>
                  {my.answeredOptionIndex === quiz.result.correctIndex ? "Bạn trả lời đúng!" : "Bạn trả lời chưa đúng."}
                </p>
              )}
              {quiz.result.explanation && <p className="text-sm text-slate-700">{quiz.result.explanation}</p>}
            </>
          ) : (
            <div className="grid gap-2">
              {quiz.options.map((o, i) => {
                const picked = my.answeredOptionIndex === i;
                return (
                  <button
                    key={i}
                    onClick={() => answer(i)}
                    disabled={quiz.status !== "OPEN" || my.answeredOptionIndex !== null}
                    className={`rounded-lg border-2 px-4 py-3 text-left text-base ${picked ? "border-brand bg-blue-50 font-semibold" : "border-slate-200 bg-white"} disabled:cursor-default`}
                  >
                    {String.fromCharCode(65 + i)}. {o} {picked && "✓"}
                  </button>
                );
              })}
              {my.answeredOptionIndex !== null && <p className="text-sm text-ok">Bạn đã nộp. Chờ giảng viên công bố kết quả.</p>}
              {quiz.status === "CLOSED" && my.answeredOptionIndex === null && <p className="text-sm text-slate-600">Quiz đã đóng, không thể nộp nữa.</p>}
            </div>
          )}
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Slide {shownIndex + 1}{following ? " · đang theo bài giảng" : ` · đang xem lại (giảng viên ở slide ${state.currentIndex + 1})`}</span>
        </div>
        {slide && <SlideView slide={slide} size="md" className="border border-slate-200 shadow-sm" />}
        <div className="flex items-center gap-2">
          <button className="btn-secondary flex-1 py-3" onClick={() => setViewIndex(Math.max(0, shownIndex - 1))} disabled={shownIndex === 0} aria-label="Slide trước">←</button>
          {!following && (
            <button className="btn-primary flex-[2] py-3" onClick={() => setViewIndex(null)}>Về bài giảng</button>
          )}
          <button
            className="btn-secondary flex-1 py-3"
            onClick={() => {
              const n = shownIndex + 1;
              setViewIndex(n >= state.currentIndex ? null : n);
            }}
            disabled={shownIndex >= state.maxPublishedIndex || following}
            aria-label="Slide sau"
          >
            →
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2">
        <button onClick={() => react("UNDERSTOOD")} aria-pressed={my.reactionForCurrent === "UNDERSTOOD"} className={`rounded-xl border-2 py-4 text-base font-semibold ${my.reactionForCurrent === "UNDERSTOOD" ? "border-ok bg-green-50 text-ok" : "border-slate-200 bg-white"}`}>👍 Em hiểu</button>
        <button onClick={() => react("CONFUSED")} aria-pressed={my.reactionForCurrent === "CONFUSED"} className={`rounded-xl border-2 py-4 text-base font-semibold ${my.reactionForCurrent === "CONFUSED" ? "border-warn bg-amber-50 text-warn" : "border-slate-200 bg-white"}`}>🤔 Em chưa rõ</button>
      </section>
      <p className="-mt-1 text-center text-xs text-slate-500">Biểu cảm cho slide {state.currentIndex + 1} đang giảng</p>

      <form onSubmit={ask} className="card space-y-2 p-3">
        <label htmlFor="q" className="text-sm font-medium">Đặt câu hỏi cho giảng viên</label>
        <textarea id="q" className="input min-h-20 text-base" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} placeholder="Câu hỏi chỉ giảng viên thấy" />
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">{question.length}/500</span>
          <button className="btn-primary" disabled={sending || !question.trim()}>Gửi</button>
        </div>
      </form>

      {msg && <div role="status" className="fixed inset-x-3 bottom-4 z-50 rounded-lg bg-slate-900 px-4 py-3 text-center text-sm text-white shadow-lg">{msg}</div>}
    </div>
  );
}

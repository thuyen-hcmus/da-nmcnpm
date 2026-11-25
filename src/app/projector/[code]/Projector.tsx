"use client";
import { useEffect, useState } from "react";
import { SlideView } from "@/client/components/SlideView";
import { QuizChart } from "@/client/components/QuizChart";
import { QrImage } from "@/client/components/QrImage";
import { CONNECT_ERRORS } from "@/client/components/ConnectionBanner";
import { useSessionSocket } from "@/client/realtime/useSessionSocket";
import type { ProjectorState } from "@/shared/contracts";

/** Màn hình chung: chỉ nội dung công khai, chữ lớn, tương phản cao, không có điều khiển. */
export function Projector({ code }: { code: string }) {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    const t = new URLSearchParams(window.location.hash.slice(1)).get("t");
    setToken(t ?? "");
  }, []);
  const { state, status, error } = useSessionSocket<ProjectorState>({ code, role: "projector", token, enabled: token !== null });

  if (token === "") return <Center>Thiếu mã máy chiếu. Hãy mở màn hình chiếu từ bảng điều khiển của giảng viên.</Center>;
  if (error) return <Center>{CONNECT_ERRORS[error] ?? error}</Center>;
  if (!state) return <Center>Đang kết nối…</Center>;
  if (state.status === "ENDED") return <Center>Phiên đã kết thúc. Cảm ơn các bạn!</Center>;

  const quiz = state.activeQuiz;
  return (
    <div className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-slate-900 p-[2vw]">
      {status !== "connected" && <div className="absolute right-4 top-4 z-10 rounded bg-amber-500 px-3 py-1 text-sm text-white">Đang kết nối lại…</div>}

      {quiz ? (
        <div className="flex aspect-video w-full max-w-[min(100%,177vh)] flex-col rounded-xl bg-white p-[4vw] text-slate-900">
          <p className="mb-[1vw] text-[clamp(1.25rem,2vw,2rem)] font-semibold text-amber-700">
            {quiz.status === "OPEN" ? "Quiz đang mở – trả lời trên điện thoại" : quiz.status === "CLOSED" ? "Quiz đã đóng" : "Kết quả"}
          </p>
          <h2 className="mb-[2vw] text-[clamp(2rem,3.6vw,3.5rem)] font-bold leading-tight">{quiz.prompt}</h2>
          {quiz.result ? (
            <>
              <QuizChart options={quiz.options} counts={quiz.result.counts} correctIndex={quiz.result.correctIndex} size="xl" />
              {quiz.result.explanation && <p className="mt-[1.5vw] text-[clamp(1.5rem,2.4vw,2.25rem)] text-slate-700">{quiz.result.explanation}</p>}
            </>
          ) : (
            <ol className="grid flex-1 grid-cols-2 gap-[1.5vw] text-[clamp(1.75rem,3vw,3rem)]">
              {quiz.options.map((o, i) => (
                <li key={i} className="flex items-center rounded-xl border-4 border-slate-200 px-[2vw]">
                  <b className="mr-4 text-brand">{String.fromCharCode(65 + i)}.</b>
                  {o}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : state.currentSlide ? (
        <div className="w-full max-w-[min(100%,177vh)]">
          <SlideView slide={state.currentSlide} size="xl" />
        </div>
      ) : null}

      {state.spotlightQuestion && (
        <div className="absolute inset-x-[4vw] bottom-[3vw] rounded-xl bg-brand px-[2vw] py-[1.2vw] text-white shadow-2xl">
          <p className="text-[clamp(1rem,1.6vw,1.5rem)] opacity-80">Câu hỏi từ {state.spotlightQuestion.displayName ?? "một bạn"}</p>
          <p className="text-[clamp(1.75rem,3vw,3rem)] font-semibold">{state.spotlightQuestion.text}</p>
        </div>
      )}

      {state.showJoinQr && (
        <div className="absolute bottom-[2vw] right-[2vw] flex items-center gap-[1.5vw] rounded-xl bg-white p-[1.2vw] shadow-2xl">
          <QrImage value={state.joinUrl} label="QR tham gia phiên" className="h-[18vh] w-[18vh]" />
          <div className="text-slate-900">
            <p className="text-[clamp(1rem,1.5vw,1.5rem)]">Quét QR hoặc vào</p>
            <p className="text-[clamp(1.1rem,1.6vw,1.6rem)] font-semibold">{state.joinUrl.replace(/^https?:\/\//, "")}</p>
            <p className="mt-1 text-[clamp(1.5rem,3vw,3rem)] font-bold tracking-[0.2em] text-brand">{state.code}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <div className="flex h-dvh items-center justify-center bg-slate-900 p-8 text-center text-3xl text-white">{children}</div>;
}

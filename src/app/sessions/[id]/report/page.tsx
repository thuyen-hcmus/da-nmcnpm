import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/server/http";
import { sessionReport } from "@/server/services/report-service";
import { AppError } from "@/shared/errors";
import { TopBar } from "@/client/components/TopBar";
import { QuizChart } from "@/client/components/QuizChart";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect("/login");
  let r;
  try {
    r = await sessionReport(user.id, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const maxReact = Math.max(1, ...r.reactions.map((x) => x.understood + x.confused));
  return (
    <>
      <TopBar name={user.name} />
      <main className="mx-auto max-w-5xl space-y-6 p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm text-slate-500">Báo cáo phiên {r.session.code}</p>
            <h1 className="text-2xl font-bold">{r.session.lectureTitle}</h1>
            <p className="text-sm text-slate-500">
              {new Date(r.session.startedAt).toLocaleString("vi-VN")}
              {r.session.endedAt && ` – ${new Date(r.session.endedAt).toLocaleTimeString("vi-VN")}`}
              {r.session.status === "LIVE" && " · đang diễn ra"}
            </p>
          </div>
          <Link href={`/lectures/${r.session.lectureId}/edit`} className="btn-secondary">Về bài giảng</Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Người tham gia" value={r.participantCount} />
          <Stat label="Câu quiz đã dùng" value={r.quizzes.length} />
          <Stat label="Câu hỏi của lớp" value={r.questions.length} />
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Kết quả quiz</h2>
          {r.quizzes.length === 0 && <p className="text-sm text-slate-500">Không có quiz nào trong phiên.</p>}
          {r.quizzes.map((q) => (
            <div key={q.id} className="card space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium">{q.prompt}</p>
                <span className="badge shrink-0 bg-slate-100 text-slate-700">Đúng {Math.round(q.correctRate * 100)}%</span>
              </div>
              <QuizChart options={q.options} counts={q.counts} correctIndex={q.correctIndex} />
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Mức độ hiểu theo slide</h2>
          <div className="card divide-y divide-slate-100">
            {r.reactions.map((x) => (
              <div key={x.slideIndex} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-center gap-3 p-3 text-sm">
                <span className="truncate">{x.slideIndex + 1}. {x.title}</span>
                <div className="flex items-center gap-2">
                  <div className="flex h-3 flex-1 overflow-hidden rounded bg-slate-100" aria-label={`${x.understood} hiểu, ${x.confused} chưa rõ`}>
                    <div className="bg-ok" style={{ width: `${(x.understood / maxReact) * 100}%` }} />
                    <div className="bg-warn" style={{ width: `${(x.confused / maxReact) * 100}%` }} />
                  </div>
                  <span className="w-28 shrink-0 text-xs tabular-nums text-slate-600">👍 {x.understood} · 🤔 {x.confused}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Câu hỏi của sinh viên</h2>
          {r.questions.length === 0 ? (
            <p className="text-sm text-slate-500">Không có câu hỏi nào.</p>
          ) : (
            <ul className="card divide-y divide-slate-100">
              {r.questions.map((q) => (
                <li key={q.id} className="p-3 text-sm">
                  <p>{q.text}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {q.displayName ?? "Ẩn danh"} · {new Date(q.createdAt).toLocaleTimeString("vi-VN")} · {q.status === "ANSWERED" ? "đã trả lời" : q.status === "HIDDEN" ? "đã ẩn" : "chưa xử lý"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <p className="text-3xl font-bold tabular-nums">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}

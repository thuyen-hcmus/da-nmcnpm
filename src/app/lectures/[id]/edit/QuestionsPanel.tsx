"use client";
import { useState } from "react";
import { SlideView } from "@/client/components/SlideView";
import { api, errorMessage } from "@/client/lib/api";
import type { SerializedQuestion, SerializedSlide } from "@/server/services/lecture-service";

type Draft = { prompt: string; options: string[]; correctIndex: number; explanation: string };

/** Danh sách câu hỏi quiz: sửa, duyệt từng câu, đối chiếu slide căn cứ (FR-031). */
export function QuestionsPanel({
  lectureId,
  slides,
  questions,
  onChange,
  onError,
}: {
  lectureId: string;
  slides: SerializedSlide[];
  questions: SerializedQuestion[];
  onChange: (qs: SerializedQuestion[]) => void;
  onError: (msg: string) => void;
}) {
  const [creating, setCreating] = useState(false);

  async function create() {
    setCreating(true);
    try {
      const q = await api<SerializedQuestion>(`/api/lectures/${lectureId}/questions`, {
        method: "POST",
        json: { prompt: "Câu hỏi mới", options: ["Lựa chọn A", "Lựa chọn B"], correctIndex: 0, explanation: "", sourceSlideIds: [] },
      });
      onChange([...questions, q]);
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">Chỉ câu <b>Đã duyệt</b> mới mở được trong phiên. Sửa một câu đã duyệt sẽ đưa nó về nháp.</p>
        <button className="btn-secondary" onClick={create} disabled={creating}>+ Thêm câu hỏi</button>
      </div>
      {questions.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">Chưa có câu hỏi. Chọn slide ở danh sách bên trái rồi bấm “AI tạo quiz”, hoặc thêm thủ công.</div>
      )}
      {questions.map((q) => (
        <QuestionCard
          key={q.id}
          q={q}
          slides={slides}
          onSaved={(nq) => onChange(questions.map((x) => (x.id === nq.id ? nq : x)))}
          onDeleted={() => onChange(questions.filter((x) => x.id !== q.id))}
          onError={onError}
        />
      ))}
    </div>
  );
}

function QuestionCard({
  q,
  slides,
  onSaved,
  onDeleted,
  onError,
}: {
  q: SerializedQuestion;
  slides: SerializedSlide[];
  onSaved: (q: SerializedQuestion) => void;
  onDeleted: () => void;
  onError: (msg: string) => void;
}) {
  const [d, setD] = useState<Draft>({ prompt: q.prompt, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation });
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const dirty = d.prompt !== q.prompt || d.explanation !== q.explanation || d.correctIndex !== q.correctIndex || JSON.stringify(d.options) !== JSON.stringify(q.options);
  const sources = q.sourceSlideIds.map((id) => slides.find((s) => s.id === id)).filter((s): s is SerializedSlide => !!s);

  async function save() {
    setBusy(true);
    setLocalError(null);
    try {
      onSaved(await api<SerializedQuestion>(`/api/questions/${q.id}`, { method: "PATCH", json: d }));
    } catch (e) {
      setLocalError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function approve() {
    setBusy(true);
    setLocalError(null);
    try {
      if (dirty) await api(`/api/questions/${q.id}`, { method: "PATCH", json: d });
      onSaved(await api<SerializedQuestion>(`/api/questions/${q.id}/approve`, { method: "POST" }));
    } catch (e) {
      setLocalError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!confirm("Xóa câu hỏi này?")) return;
    try {
      await api(`/api/questions/${q.id}`, { method: "DELETE" });
      onDeleted();
    } catch (e) {
      onError(errorMessage(e));
    }
  }

  return (
    <div className={`card grid gap-4 p-4 ${sources.length ? "xl:grid-cols-[minmax(0,1fr)_280px]" : ""}`}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${q.status === "APPROVED" && !dirty ? "bg-green-100 text-ok" : "bg-amber-100 text-amber-800"}`}>
            {q.status === "APPROVED" && !dirty ? "Đã duyệt" : "Nháp"}
          </span>
          {q.source === "AI" && <span className="badge bg-purple-100 text-purple-800">AI tạo</span>}
          <button className="btn-ghost ml-auto px-2 py-1 text-xs text-bad" onClick={remove}>Xóa</button>
        </div>
        <div>
          <label className="label" htmlFor={`p-${q.id}`}>Câu hỏi</label>
          <textarea id={`p-${q.id}`} className="input min-h-16" value={d.prompt} maxLength={500} onChange={(e) => setD({ ...d, prompt: e.target.value })} />
        </div>
        <fieldset className="space-y-2">
          <legend className="label">Lựa chọn (chọn đáp án đúng)</legend>
          {d.options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name={`c-${q.id}`} checked={d.correctIndex === i} onChange={() => setD({ ...d, correctIndex: i })} aria-label={`Đáp án đúng là lựa chọn ${i + 1}`} />
              <input
                className="input"
                value={o}
                maxLength={200}
                aria-label={`Lựa chọn ${i + 1}`}
                onChange={(e) => setD({ ...d, options: d.options.map((x, k) => (k === i ? e.target.value : x)) })}
              />
              <button
                type="button"
                className="btn-ghost px-2"
                aria-label={`Xóa lựa chọn ${i + 1}`}
                disabled={d.options.length <= 2}
                onClick={() => {
                  const options = d.options.filter((_, k) => k !== i);
                  const correctIndex = d.correctIndex === i ? 0 : d.correctIndex > i ? d.correctIndex - 1 : d.correctIndex;
                  setD({ ...d, options, correctIndex });
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {d.options.length < 6 && (
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setD({ ...d, options: [...d.options, `Lựa chọn ${String.fromCharCode(65 + d.options.length)}`] })}>
              + Thêm lựa chọn
            </button>
          )}
        </fieldset>
        <div>
          <label className="label" htmlFor={`e-${q.id}`}>Giải thích ngắn</label>
          <textarea id={`e-${q.id}`} className="input min-h-12" value={d.explanation} maxLength={1000} onChange={(e) => setD({ ...d, explanation: e.target.value })} />
        </div>
        {localError && <p role="alert" className="text-sm text-bad">{localError}</p>}
        <div className="flex gap-2">
          <button className="btn-secondary" disabled={!dirty || busy} onClick={save}>Lưu (về nháp)</button>
          <button className="btn-primary" disabled={busy || (q.status === "APPROVED" && !dirty)} onClick={approve}>
            {q.status === "APPROVED" && !dirty ? "✓ Đã duyệt" : "Duyệt câu này"}
          </button>
        </div>
      </div>
      {sources.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase text-slate-500">Slide căn cứ – đối chiếu</p>
          {sources.map((s) => (
            <div key={s.id}>
              <SlideView slide={s} size="sm" className="border border-slate-200" />
              <p className="mt-1 text-xs text-slate-600">Slide {s.position + 1}: {s.title}</p>
            </div>
          ))}
        </div>
      )}
      {q.sourceSlideIds.length > 0 && sources.length === 0 && <p className="text-xs text-warn">Slide căn cứ đã bị xóa khỏi bài giảng.</p>}
    </div>
  );
}

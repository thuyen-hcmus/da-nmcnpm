"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { SlideView } from "@/client/components/SlideView";
import { api, errorMessage } from "@/client/lib/api";
import type { SerializedQuestion, SerializedSlide } from "@/server/services/lecture-service";
import type { SlideTemplate } from "@/shared/contracts";
import { QuestionsPanel } from "./QuestionsPanel";
import { AiDialogs, type DialogKind } from "./AiDialogs";

type Detail = {
  lecture: { id: string; title: string; outline: string };
  slides: SerializedSlide[];
  questions: SerializedQuestion[];
  sessions: { id: string; code: string; status: string; startedAt: string; endedAt: string | null }[];
};

const TEMPLATE_LABEL: Record<SlideTemplate, string> = { TITLE: "Tiêu đề", CONTENT: "Nội dung", QUIZ: "Quiz" };

export function Editor({ initial }: { initial: Detail }) {
  const router = useRouter();
  const lectureId = initial.lecture.id;
  const [title, setTitle] = useState(initial.lecture.title);
  const [outline, setOutline] = useState(initial.lecture.outline);
  const [slides, setSlides] = useState(initial.slides);
  const [questions, setQuestions] = useState(initial.questions);
  const [currentId, setCurrentId] = useState<string | null>(initial.slides[0]?.id ?? null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [tab, setTab] = useState<"slide" | "questions" | "outline">("slide");
  const [suggestion, setSuggestion] = useState<{ action: string; title?: string; body?: string; notes?: string } | null>(null);
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingSlidePatches = useRef(new Map<string, Partial<SerializedSlide>>());

  const current = slides.find((s) => s.id === currentId) ?? null;
  const approved = useMemo(() => questions.filter((q) => q.status === "APPROVED"), [questions]);

  async function refresh() {
    const d = await api<Detail>(`/api/lectures/${lectureId}`);
    setSlides(d.slides);
    setQuestions(d.questions);
    return d;
  }

  function debounced(key: string, fn: () => Promise<unknown>) {
    const t = timers.current.get(key);
    if (t) clearTimeout(t);
    setSaving("saving");
    timers.current.set(
      key,
      setTimeout(async () => {
        timers.current.delete(key);
        try {
          await fn();
          setSaving("saved");
        } catch (e) {
          setSaving("error");
          setError(errorMessage(e));
        }
      }, 600),
    );
  }

  function patchSlide(id: string, patch: Partial<SerializedSlide>) {
    setSlides((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    const pending = { ...pendingSlidePatches.current.get(id), ...patch };
    pendingSlidePatches.current.set(id, pending);
    debounced(`slide:${id}`, () => {
      pendingSlidePatches.current.delete(id);
      return api(`/api/slides/${id}`, { method: "PATCH", json: pending });
    });
  }

  async function addSlide(template: SlideTemplate) {
    setError(null);
    try {
      const pos = current ? current.position + 1 : slides.length;
      const s = await api<SerializedSlide>(`/api/lectures/${lectureId}/slides`, {
        method: "POST",
        json: { template, title: template === "QUIZ" ? "Kiểm tra nhanh" : "", body: "", position: pos, questionId: template === "QUIZ" ? (approved[0]?.id ?? null) : null },
      });
      await refresh();
      setCurrentId(s.id);
      setTab("slide");
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function removeSlide(id: string) {
    if (!confirm("Xóa slide này?")) return;
    try {
      await api(`/api/slides/${id}`, { method: "DELETE" });
      const d = await refresh();
      setCurrentId(d.slides[0]?.id ?? null);
      setSelected((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function move(id: string, dir: -1 | 1) {
    const i = slides.findIndex((s) => s.id === id);
    const j = i + dir;
    if (j < 0 || j >= slides.length) return;
    const ids = slides.map((s) => s.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setSlides((ss) => ids.map((sid, k) => ({ ...ss.find((s) => s.id === sid)!, position: k })));
    try {
      await api(`/api/lectures/${lectureId}/slides/order`, { method: "PUT", json: { slideIds: ids } });
    } catch (e) {
      setError(errorMessage(e));
      await refresh();
    }
  }

  async function suggest(action: "condense" | "notes" | "rewrite" | "expand") {
    if (!current) return;
    setAiBusy(action);
    setSuggestion(null);
    setError(null);
    try {
      const r = await api<{ suggestion: { title?: string; body?: string; notes?: string } }>(`/api/slides/${current.id}/ai/suggest`, { method: "POST", json: { action } });
      setSuggestion({ action, ...r.suggestion });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setAiBusy(null);
    }
  }

  async function startSession() {
    setError(null);
    try {
      const r = await api<{ session: { id: string } }>(`/api/lectures/${lectureId}/sessions`, { method: "POST" });
      router.push(`/present/${r.session.id}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => {
    if (saving !== "saved") return;
    const t = setTimeout(() => setSaving("idle"), 1500);
    return () => clearTimeout(t);
  }, [saving]);

  const live = initial.sessions.find((s) => s.status === "LIVE");
  const drafts = slides.filter((s) => s.isAiDraft).length;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-2xl font-bold hover:border-slate-300 focus:border-brand focus:outline-none"
          value={title}
          aria-label="Tên bài giảng"
          maxLength={200}
          onChange={(e) => {
            setTitle(e.target.value);
            if (e.target.value.trim()) debounced("title", () => api(`/api/lectures/${lectureId}`, { method: "PATCH", json: { title: e.target.value.trim() } }));
          }}
        />
        <span className="text-xs text-slate-500" aria-live="polite">
          {saving === "saving" ? "Đang lưu…" : saving === "saved" ? "Đã lưu" : saving === "error" ? "Lỗi khi lưu" : ""}
        </span>
        {live ? (
          <Link href={`/present/${live.id}`} className="btn-primary">Vào phiên đang chạy</Link>
        ) : (
          <button className="btn-primary" onClick={startSession} disabled={slides.length === 0}>Bắt đầu trình chiếu</button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" onClick={() => setDialog("idea")}>✨ Tạo slide từ ý tưởng (AI)</button>
        <button className="btn-secondary" onClick={() => setDialog("paste")}>📋 Dán văn bản, AI chia slide</button>
        <button className="btn-secondary" onClick={() => setDialog("pptx")}>📂 Nhập PowerPoint (.pptx)</button>
        <button
          className="btn-secondary"
          disabled={selected.size === 0}
          onClick={() => setDialog("quiz")}
          title={selected.size === 0 ? "Chọn ít nhất 1 slide trong danh sách bên trái" : undefined}
        >
          ❓ AI tạo quiz từ {selected.size || ""} slide đã chọn
        </button>
      </div>

      {error && (
        <p role="alert" className="flex items-start justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-bad">
          <span>{error}</span>
          <button className="text-xs underline" onClick={() => setError(null)}>Đóng</button>
        </p>
      )}
      {drafts > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Có {drafts} slide nháp do AI tạo. Hãy xem lại và bấm “Xác nhận nội dung” trên từng slide.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="card max-h-[75vh] overflow-y-auto p-2" aria-label="Danh sách slide">
          {slides.length === 0 && <p className="p-4 text-sm text-slate-500">Chưa có slide. Thêm slide hoặc dùng AI / PowerPoint ở trên.</p>}
          <ol className="space-y-2">
            {slides.map((s, i) => (
              <li key={s.id} className={`rounded-lg border-2 p-1 ${s.id === currentId ? "border-brand" : "border-transparent"}`}>
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    aria-label={`Chọn slide ${i + 1} để tạo quiz`}
                    checked={selected.has(s.id)}
                    onChange={(e) =>
                      setSelected((sel) => {
                        const n = new Set(sel);
                        if (e.target.checked) n.add(s.id);
                        else n.delete(s.id);
                        return n;
                      })
                    }
                  />
                  <button className="min-w-0 flex-1 text-left" onClick={() => { setCurrentId(s.id); setTab("slide"); setSuggestion(null); }}>
                    <SlideView slide={s} size="sm" className="border border-slate-200" />
                    <span className="mt-1 flex items-center gap-1 text-xs text-slate-600">
                      <b>{i + 1}.</b>
                      <span className="truncate">{s.title || TEMPLATE_LABEL[s.template]}</span>
                      {s.isAiDraft && <span className="badge ml-auto shrink-0 bg-amber-100 text-amber-800">Nháp AI</span>}
                    </span>
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-3 grid grid-cols-3 gap-1 border-t border-slate-100 pt-2">
            {(["TITLE", "CONTENT", "QUIZ"] as const).map((t) => (
              <button key={t} className="btn-ghost px-1 text-xs" onClick={() => addSlide(t)}>+ {TEMPLATE_LABEL[t]}</button>
            ))}
          </div>
        </aside>

        <section className="space-y-3">
          <div className="flex gap-1 border-b border-slate-200">
            {(
              [
                ["slide", "Slide"],
                ["questions", `Câu hỏi quiz (${questions.length})`],
                ["outline", "Dàn ý"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === k ? "border-brand text-brand" : "border-transparent text-slate-600"}`} onClick={() => setTab(k)}>
                {label}
              </button>
            ))}
          </div>

          {tab === "outline" && (
            <div className="card p-4">
              <label className="label" htmlFor="outline">Dàn ý bài giảng (chỉ giảng viên thấy)</label>
              <textarea
                id="outline"
                className="input min-h-64"
                value={outline}
                maxLength={5000}
                onChange={(e) => {
                  setOutline(e.target.value);
                  debounced("outline", () => api(`/api/lectures/${lectureId}`, { method: "PATCH", json: { outline: e.target.value } }));
                }}
              />
            </div>
          )}

          {tab === "questions" && (
            <QuestionsPanel lectureId={lectureId} slides={slides} questions={questions} onChange={setQuestions} onError={setError} />
          )}

          {tab === "slide" &&
            (current ? (
              <div className="grid gap-4 xl:grid-cols-2">
                <div className="card space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-sm font-medium" htmlFor="tpl">Mẫu</label>
                    <select id="tpl" className="input w-auto" value={current.template} onChange={(e) => patchSlide(current.id, { template: e.target.value as SlideTemplate })}>
                      <option value="TITLE">Tiêu đề</option>
                      <option value="CONTENT">Nội dung</option>
                      <option value="QUIZ">Quiz</option>
                    </select>
                    <div className="ml-auto flex gap-1">
                      <button className="btn-ghost px-2" aria-label="Đưa slide lên" onClick={() => move(current.id, -1)} disabled={current.position === 0}>↑</button>
                      <button className="btn-ghost px-2" aria-label="Đưa slide xuống" onClick={() => move(current.id, 1)} disabled={current.position === slides.length - 1}>↓</button>
                      <button className="btn-ghost px-2 text-bad" onClick={() => removeSlide(current.id)}>Xóa</button>
                    </div>
                  </div>
                  {current.isAiDraft && (
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      <span>Slide nháp do AI tạo — kiểm tra trước khi dùng.</span>
                      <button className="btn-secondary px-2 py-1 text-xs" onClick={() => patchSlide(current.id, { isAiDraft: false })}>Xác nhận nội dung</button>
                    </div>
                  )}
                  <div>
                    <label className="label" htmlFor="st">Tiêu đề</label>
                    <input id="st" className="input" value={current.title} maxLength={200} onChange={(e) => patchSlide(current.id, { title: e.target.value })} />
                  </div>
                  {current.template !== "QUIZ" ? (
                    <div>
                      <label className="label" htmlFor="sb">{current.template === "TITLE" ? "Phụ đề" : "Nội dung (mỗi dòng một ý)"}</label>
                      <textarea id="sb" className="input min-h-40" value={current.body} maxLength={5000} onChange={(e) => patchSlide(current.id, { body: e.target.value })} />
                    </div>
                  ) : (
                    <div>
                      <label className="label" htmlFor="sq">Câu hỏi đã duyệt cho slide này</label>
                      <select id="sq" className="input" value={current.questionId ?? ""} onChange={(e) => patchSlide(current.id, { questionId: e.target.value || null })}>
                        <option value="">(chưa chọn)</option>
                        {approved.map((q) => (
                          <option key={q.id} value={q.id}>{q.prompt.slice(0, 90)}</option>
                        ))}
                      </select>
                      {approved.length === 0 && <p className="mt-1 text-xs text-slate-500">Chưa có câu hỏi nào được duyệt. Tạo/duyệt ở tab “Câu hỏi quiz”.</p>}
                    </div>
                  )}
                  <div>
                    <label className="label" htmlFor="sn">Ghi chú thuyết trình (chỉ giảng viên thấy)</label>
                    <textarea id="sn" className="input min-h-24" value={current.notes} maxLength={5000} onChange={(e) => patchSlide(current.id, { notes: e.target.value })} />
                  </div>

                  {current.template !== "QUIZ" && (
                    <div className="space-y-2 border-t border-slate-100 pt-3">
                      <p className="text-xs font-medium uppercase text-slate-500">AI gợi ý cho slide này</p>
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            ["condense", "Rút gọn"],
                            ["rewrite", "Viết lại"],
                            ["expand", "Bổ sung"],
                            ["notes", "Gợi ý ghi chú"],
                          ] as const
                        ).map(([a, label]) => (
                          <button key={a} className="btn-secondary px-3 py-1 text-xs" disabled={!!aiBusy} onClick={() => suggest(a)}>
                            {aiBusy === a ? "AI đang viết…" : label}
                          </button>
                        ))}
                      </div>
                      {suggestion && (
                        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
                          <p className="font-medium text-amber-900">Đề xuất của AI (chưa áp dụng)</p>
                          {suggestion.title !== undefined && <p><b>Tiêu đề:</b> {suggestion.title}</p>}
                          {suggestion.body !== undefined && <p className="whitespace-pre-wrap"><b>Nội dung:</b>{"\n"}{suggestion.body}</p>}
                          {suggestion.notes !== undefined && <p className="whitespace-pre-wrap"><b>Ghi chú:</b> {suggestion.notes}</p>}
                          <div className="flex gap-2">
                            <button
                              className="btn-primary px-3 py-1 text-xs"
                              onClick={() => {
                                const p: Partial<SerializedSlide> = {};
                                if (suggestion.title !== undefined) p.title = suggestion.title;
                                if (suggestion.body !== undefined) p.body = suggestion.body;
                                if (suggestion.notes !== undefined) p.notes = suggestion.notes;
                                patchSlide(current.id, p);
                                setSuggestion(null);
                              }}
                            >
                              Áp dụng
                            </button>
                            <button className="btn-ghost px-3 py-1 text-xs" onClick={() => setSuggestion(null)}>Bỏ</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-slate-500">Xem trước</p>
                  <SlideView slide={current} size="md" className="border border-slate-200 shadow" quizHint={current.template === "QUIZ" ? (questions.find((q) => q.id === current.questionId)?.prompt ?? "Chưa gắn câu hỏi") : undefined} />
                </div>
              </div>
            ) : (
              <div className="card p-10 text-center text-slate-500">Chọn hoặc thêm một slide để bắt đầu soạn.</div>
            ))}

          {initial.sessions.length > 0 && (
            <div className="card p-4">
              <h2 className="mb-2 text-sm font-semibold">Các phiên đã trình chiếu</h2>
              <ul className="space-y-1 text-sm">
                {initial.sessions.map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="font-mono">{s.code}</span>
                    <span className="text-slate-500">{new Date(s.startedAt).toLocaleString("vi-VN")}</span>
                    {s.status === "LIVE" ? (
                      <Link className="text-brand underline" href={`/present/${s.id}`}>đang chạy</Link>
                    ) : (
                      <Link className="text-brand underline" href={`/sessions/${s.id}/report`}>xem báo cáo</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <AiDialogs
        kind={dialog}
        lectureId={lectureId}
        selectedSlideIds={slides.filter((s) => selected.has(s.id)).map((s) => s.id)}
        onClose={() => setDialog(null)}
        onDone={async (what) => {
          const before = new Set(slides.map((s) => s.id));
          const d = await refresh();
          setDialog(null);
          if (what === "quiz") {
            setTab("questions");
            setSelected(new Set());
          } else {
            const added = d.slides.find((s) => !before.has(s.id));
            if (added) setCurrentId(added.id);
            setTab("slide");
          }
        }}
      />
    </div>
  );
}

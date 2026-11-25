"use client";
import { useState } from "react";
import { api, errorMessage } from "@/client/lib/api";

export type DialogKind = "idea" | "paste" | "pptx" | "quiz";

const MAX_PPTX = 20 * 1024 * 1024;

export function AiDialogs({
  kind,
  lectureId,
  selectedSlideIds,
  onClose,
  onDone,
}: {
  kind: DialogKind | null;
  lectureId: string;
  selectedSlideIds: string[];
  onClose: () => void;
  onDone: (what: DialogKind) => void | Promise<void>;
}) {
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("Sinh viên năm 2 ngành CNTT");
  const [count, setCount] = useState(6);
  const [text, setText] = useState("");
  const [quizCount, setQuizCount] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!kind) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (kind === "idea") {
        await api(`/api/lectures/${lectureId}/ai/generate-slides`, { method: "POST", json: { topic, audience, slideCount: count } });
      } else if (kind === "paste") {
        await api(`/api/lectures/${lectureId}/ai/split-text`, { method: "POST", json: { text, maxSlides: count } });
      } else if (kind === "quiz") {
        await api(`/api/lectures/${lectureId}/ai/generate-quiz`, { method: "POST", json: { slideIds: selectedSlideIds, count: quizCount } });
      } else {
        if (!file) throw new Error("Chọn tệp .pptx");
        if (file.size > MAX_PPTX) throw new Error("Tệp quá lớn (tối đa 20 MB)");
        if (!/\.pptx$/i.test(file.name)) throw new Error("Chỉ hỗ trợ tệp .pptx");
        const fd = new FormData();
        fd.append("file", file);
        await api(`/api/lectures/${lectureId}/import-pptx`, { method: "POST", body: fd });
      }
      await onDone(kind!);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<DialogKind, string> = {
    idea: "Tạo slide nháp từ ý tưởng",
    paste: "Dán văn bản để AI chia thành slide",
    pptx: "Nhập tệp PowerPoint",
    quiz: "AI tạo câu hỏi quiz từ slide đã chọn",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
      <form onSubmit={submit} className="card w-full max-w-lg space-y-4 p-6">
        <h2 id="dlg-title" className="text-lg font-bold">{titles[kind]}</h2>

        {kind === "idea" && (
          <>
            <div>
              <label className="label" htmlFor="topic">Chủ đề / ý tưởng</label>
              <textarea id="topic" className="input min-h-20" value={topic} onChange={(e) => setTopic(e.target.value)} maxLength={500} required placeholder="Ví dụ: Giải thích vì sao hai người không thể cùng mua một ghế cho một suất chiếu" />
            </div>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <div>
                <label className="label" htmlFor="aud">Đối tượng học</label>
                <input id="aud" className="input" value={audience} onChange={(e) => setAudience(e.target.value)} maxLength={200} />
              </div>
              <div>
                <label className="label" htmlFor="cnt">Số slide</label>
                <input id="cnt" type="number" min={1} max={20} className="input" value={count} onChange={(e) => setCount(Number(e.target.value))} />
              </div>
            </div>
          </>
        )}
        {kind === "paste" && (
          <>
            <div>
              <label className="label" htmlFor="txt">Nội dung đã có</label>
              <textarea id="txt" className="input min-h-48" value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} required />
              <p className="mt-1 text-xs text-slate-500">{text.length.toLocaleString("vi-VN")}/20.000 ký tự</p>
            </div>
            <div className="w-32">
              <label className="label" htmlFor="cnt2">Tối đa số slide</label>
              <input id="cnt2" type="number" min={1} max={20} className="input" value={count} onChange={(e) => setCount(Number(e.target.value))} />
            </div>
          </>
        )}
        {kind === "pptx" && (
          <div>
            <label className="label" htmlFor="file">Tệp .pptx (tối đa 20 MB)</label>
            <input id="file" type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
            <p className="mt-2 text-xs text-slate-500">Hệ thống lấy tiêu đề, văn bản và ghi chú của từng slide; không giữ hình ảnh, hiệu ứng và bố cục.</p>
          </div>
        )}
        {kind === "quiz" && (
          <>
            <p className="text-sm text-slate-600">AI sẽ chỉ dùng nội dung của {selectedSlideIds.length} slide đã chọn. Câu hỏi tạo ra là bản nháp, bạn cần sửa và duyệt trước khi dùng trong phiên.</p>
            <div className="w-32">
              <label className="label" htmlFor="qc">Số câu</label>
              <input id="qc" type="number" min={1} max={5} className="input" value={quizCount} onChange={(e) => setQuizCount(Number(e.target.value))} />
            </div>
          </>
        )}

        {busy && kind !== "pptx" && <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-brand" role="status">AI đang tạo nội dung, có thể mất đến 30 giây…</p>}
        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-bad">
            {error} <span className="text-slate-500">Bạn có thể bấm lại để thử lần nữa.</span>
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Hủy</button>
          <button className="btn-primary" disabled={busy}>
            {busy ? "Đang xử lý…" : kind === "pptx" ? "Nhập" : error ? "Thử lại" : "Tạo bằng AI"}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/client/lib/api";

type Item = { id: string; title: string; slideCount: number; updatedAt: string; liveSessionId: string | null };

export function LectureList({ initial }: { initial: Item[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    setItems(await api<Item[]>("/api/lectures"));
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Nhập tên bài giảng");
    setBusy("create");
    setError(null);
    try {
      const l = await api<{ id: string }>("/api/lectures", { method: "POST", json: { title } });
      router.push(`/lectures/${l.id}/edit`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  async function act(id: string, kind: "duplicate" | "delete" | "present" | "rename") {
    setError(null);
    try {
      if (kind === "delete") {
        if (!confirm("Xóa bài giảng này? Thao tác không hoàn tác được.")) return;
        setBusy(id);
        await api(`/api/lectures/${id}`, { method: "DELETE" });
      } else if (kind === "duplicate") {
        setBusy(id);
        await api(`/api/lectures/${id}/duplicate`, { method: "POST" });
      } else if (kind === "rename") {
        const cur = items.find((i) => i.id === id);
        const t = prompt("Tên mới của bài giảng", cur?.title ?? "");
        if (!t?.trim()) return;
        setBusy(id);
        await api(`/api/lectures/${id}`, { method: "PATCH", json: { title: t.trim() } });
      } else {
        setBusy(id);
        const r = await api<{ session: { id: string } }>(`/api/lectures/${id}/sessions`, { method: "POST" });
        router.push(`/present/${r.session.id}`);
        return;
      }
      await reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl font-bold">Bài giảng của tôi</h1>
        <form onSubmit={create} className="flex w-full gap-2 sm:w-auto">
          <input className="input sm:w-72" placeholder="Tên bài giảng mới" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-label="Tên bài giảng mới" />
          <button className="btn-primary shrink-0" disabled={busy === "create"}>+ Tạo bài giảng</button>
        </form>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-bad">{error}</p>}
      {items.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          <p className="text-lg font-medium">Chưa có bài giảng nào</p>
          <p className="mt-1 text-sm">Tạo bài giảng mới, sau đó soạn tay, nhờ AI tạo từ ý tưởng hoặc nhập tệp PowerPoint.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((l) => (
            <li key={l.id} className="card flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/lectures/${l.id}/edit`} className="font-semibold hover:text-brand">{l.title}</Link>
                {l.liveSessionId && <span className="badge bg-green-100 text-ok">Đang trình chiếu</span>}
              </div>
              <p className="text-sm text-slate-500">
                {l.slideCount} slide · sửa lúc {new Date(l.updatedAt).toLocaleString("vi-VN")}
              </p>
              <div className="mt-auto flex flex-wrap gap-2">
                {l.liveSessionId ? (
                  <Link className="btn-primary" href={`/present/${l.liveSessionId}`}>Vào phiên đang chạy</Link>
                ) : (
                  <button className="btn-primary" disabled={busy === l.id || l.slideCount === 0} onClick={() => act(l.id, "present")} title={l.slideCount === 0 ? "Bài giảng chưa có slide" : undefined}>
                    Bắt đầu trình chiếu
                  </button>
                )}
                <Link className="btn-secondary" href={`/lectures/${l.id}/edit`}>Soạn</Link>
                <button className="btn-ghost" disabled={busy === l.id} onClick={() => act(l.id, "rename")}>Đổi tên</button>
                <button className="btn-ghost" disabled={busy === l.id} onClick={() => act(l.id, "duplicate")}>Nhân bản</button>
                <button className="btn-ghost text-bad" disabled={busy === l.id} onClick={() => act(l.id, "delete")}>Xóa</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

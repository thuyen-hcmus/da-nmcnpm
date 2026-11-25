"use client";
import Link from "next/link";
import { api } from "@/client/lib/api";

export function TopBar({ name, children }: { name: string; children?: React.ReactNode }) {
  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  }
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/lectures" className="font-bold text-brand">Lớp học tương tác</Link>
        <div className="flex flex-1 items-center gap-2 overflow-hidden">{children}</div>
        <span className="hidden text-sm text-slate-600 sm:inline">{name}</span>
        <button onClick={logout} className="btn-ghost">Đăng xuất</button>
      </div>
    </header>
  );
}

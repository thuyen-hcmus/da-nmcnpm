"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/client/lib/api";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isLogin = mode === "login";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isLogin && password.length < 8) return setError("Mật khẩu tối thiểu 8 ký tự");
    setBusy(true);
    try {
      await api(`/api/auth/${mode}`, { method: "POST", json: isLogin ? { email, password } : { email, password, name } });
      router.replace("/lectures");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6" noValidate>
        <div>
          <h1 className="text-xl font-bold">{isLogin ? "Đăng nhập giảng viên" : "Tạo tài khoản giảng viên"}</h1>
          <p className="mt-1 text-sm text-slate-500">Lớp học tương tác có AI hỗ trợ</p>
        </div>
        {!isLogin && (
          <div>
            <label className="label" htmlFor="name">Họ tên</label>
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="password">Mật khẩu</label>
          <input
            id="password"
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={isLogin ? undefined : 8}
          />
          {!isLogin && <p className="mt-1 text-xs text-slate-500">Tối thiểu 8 ký tự</p>}
        </div>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-bad">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Đang xử lý…" : isLogin ? "Đăng nhập" : "Tạo tài khoản"}
        </button>
        <p className="text-center text-sm text-slate-600">
          {isLogin ? (
            <>Chưa có tài khoản? <Link className="text-brand underline" href="/register">Đăng ký</Link></>
          ) : (
            <>Đã có tài khoản? <Link className="text-brand underline" href="/login">Đăng nhập</Link></>
          )}
        </p>
      </form>
    </main>
  );
}

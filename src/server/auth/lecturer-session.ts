import { db } from "../db";
import { env } from "../env";
import { AppError } from "@/shared/errors";
import { hashToken, randomToken } from "./crypto";

export const SESSION_COOKIE = "sid";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type LecturerUser = { id: string; email: string; name: string };

export async function createAuthSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + TTL_MS);
  await db.authSession.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function destroyAuthSession(token: string | undefined) {
  if (!token) return;
  await db.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function userFromToken(token: string | undefined | null): Promise<LecturerUser | null> {
  if (!token) return null;
  const s = await db.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
  if (!s) return null;
  if (s.expiresAt.getTime() < Date.now()) {
    await db.authSession.delete({ where: { id: s.id } }).catch(() => {});
    return null;
  }
  return s.user;
}

/** Đọc cookie từ header thô (dùng cho Socket.IO handshake). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env().PUBLIC_URL.startsWith("https://"),
    path: "/",
    expires: expiresAt,
  };
}

export async function requireUserFromToken(token: string | undefined | null): Promise<LecturerUser> {
  const user = await userFromToken(token);
  if (!user) throw new AppError("UNAUTHENTICATED");
  return user;
}

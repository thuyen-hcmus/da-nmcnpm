import { cookies } from "next/headers";
import { db } from "@/server/db";
import { verifyPassword } from "@/server/auth/crypto";
import { cookieOptions, createAuthSession, SESSION_COOKIE } from "@/server/auth/lecturer-session";
import { json, parseBody, route } from "@/server/http";
import { loginInput } from "@/shared/contracts";
import { AppError } from "@/shared/errors";

export const POST = route(async (req) => {
  const input = await parseBody(req, loginInput);
  const user = await db.user.findUnique({ where: { email: input.email } });
  // Thông báo chung, không tiết lộ email hay mật khẩu sai
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new AppError("UNAUTHENTICATED", "Email hoặc mật khẩu không đúng");
  }
  const s = await createAuthSession(user.id);
  (await cookies()).set(SESSION_COOKIE, s.token, cookieOptions(s.expiresAt));
  return json({ user: { id: user.id, email: user.email, name: user.name } });
});

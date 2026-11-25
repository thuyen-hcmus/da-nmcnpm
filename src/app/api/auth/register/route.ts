import { cookies } from "next/headers";
import { db } from "@/server/db";
import { hashPassword } from "@/server/auth/crypto";
import { cookieOptions, createAuthSession, SESSION_COOKIE } from "@/server/auth/lecturer-session";
import { json, parseBody, route } from "@/server/http";
import { registerInput } from "@/shared/contracts";
import { AppError } from "@/shared/errors";

export const POST = route(async (req) => {
  const input = await parseBody(req, registerInput);
  const exists = await db.user.findUnique({ where: { email: input.email } });
  if (exists) throw new AppError("CONFLICT", "Email đã được đăng ký");
  const user = await db.user.create({
    data: { email: input.email, name: input.name, passwordHash: await hashPassword(input.password) },
  });
  const s = await createAuthSession(user.id);
  (await cookies()).set(SESSION_COOKIE, s.token, cookieOptions(s.expiresAt));
  return json({ user: { id: user.id, email: user.email, name: user.name } }, 201);
});

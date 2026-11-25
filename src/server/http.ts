import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { AppError, ERROR_STATUS } from "@/shared/errors";
import { SESSION_COOKIE, userFromToken, type LecturerUser } from "./auth/lecturer-session";
import { log } from "./log";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function errorResponse(e: unknown) {
  const err = e instanceof AppError ? e : new AppError("INTERNAL");
  if (!(e instanceof AppError)) log.error("unhandled route error", e);
  if (err.code === "FORBIDDEN") log.warn("forbidden request", { message: err.message });
  return NextResponse.json({ error: err.toJSON() }, { status: ERROR_STATUS[err.code] });
}

type Ctx<P> = { params: Promise<P> };

/** Bọc route handler: bắt AppError → JSON lỗi theo contract. */
export function route<P = Record<string, string>>(fn: (req: Request, params: P) => Promise<Response>) {
  return async (req: Request, ctx: Ctx<P>) => {
    try {
      return await fn(req, (await ctx?.params) ?? ({} as P));
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export async function parseBody<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new AppError("VALIDATION_ERROR", "Body phải là JSON");
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new AppError("VALIDATION_ERROR", r.error.issues[0]?.message, r.error.issues);
  return r.data;
}

export async function currentUser(): Promise<LecturerUser | null> {
  const jar = await cookies();
  return userFromToken(jar.get(SESSION_COOKIE)?.value);
}

export async function requireLecturer(): Promise<LecturerUser> {
  const u = await currentUser();
  if (!u) throw new AppError("UNAUTHENTICATED");
  return u;
}

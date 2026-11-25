"use client";
import type { ApiError } from "@/shared/errors";

export class ApiCallError extends Error {
  constructor(public status: number, public error: ApiError) {
    super(error.message);
  }
}

/** fetch JSON tới REST API; lỗi theo contract được ném dưới dạng ApiCallError. */
export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
    credentials: "same-origin",
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err: ApiError = data?.error ?? { code: "INTERNAL", message: "Lỗi không xác định" };
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/api/auth") && !path.startsWith("/api/s/")) {
      window.location.href = "/login";
    }
    throw new ApiCallError(res.status, err);
  }
  return data as T;
}

export function errorMessage(e: unknown) {
  if (e instanceof ApiCallError) return e.error.message;
  if (e instanceof Error) return e.message;
  return "Có lỗi xảy ra";
}

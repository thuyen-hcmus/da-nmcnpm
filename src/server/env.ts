import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  AI_PROVIDER: z.enum(["gemini", "9router", "fake"]).default("gemini"),
  AI_API_KEY: z.string().default(""),
  AI_BASE_URL: z.string().default(""),
  AI_MODEL: z.string().min(1).default("gemini-3.1-flash-lite"),
  SESSION_SECRET: z.string().default(""),
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),
  HOST: z.string().default("localhost"),
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_URL: z.string().default(""),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Đọc biến môi trường ở server. Không bao giờ log giá trị bí mật. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Biến môi trường không hợp lệ: ${fields}`);
  }
  const value = parsed.data;
  if (!value.SESSION_SECRET) {
    if (value.NODE_ENV === "production") throw new Error("Thiếu SESSION_SECRET");
    value.SESSION_SECRET = "dev-only-insecure-secret";
  }
  if (!value.PUBLIC_URL) value.PUBLIC_URL = `http://${value.HOST === "0.0.0.0" ? "localhost" : value.HOST}:${value.PORT}`;
  cached = value;
  return value;
}

export function resetEnvCache() {
  cached = null;
}

import { createHmac, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { env } from "../env";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Băm token (HMAC-SHA256 với SESSION_SECRET) trước khi lưu CSDL. */
export function hashToken(token: string): string {
  return createHmac("sha256", env().SESSION_SECRET).update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function sessionCode(length = 6): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

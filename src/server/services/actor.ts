import { AppError } from "@/shared/errors";
import type { Role } from "@/shared/contracts";

export type Actor =
  | { role: "lecturer"; userId: string; sessionId: string }
  | { role: "projector"; sessionId: string }
  | { role: "student"; participantId: string; sessionId: string };

/** Bảng quyền tập trung cho lệnh realtime (ADR-002). */
export const COMMAND_ROLES = {
  "slide:goto": ["lecturer"],
  "qr:toggle": ["lecturer"],
  "quiz:open": ["lecturer"],
  "quiz:close": ["lecturer"],
  "quiz:publish": ["lecturer"],
  "quiz:hide": ["lecturer"],
  "question:update": ["lecturer"],
  "session:end": ["lecturer"],
  "quiz:answer": ["student"],
  "question:ask": ["student"],
  "reaction:set": ["student"],
  "session:join": ["lecturer", "projector", "student"],
} as const satisfies Record<string, readonly Role[]>;

export type Command = keyof typeof COMMAND_ROLES;

export function assertCanRun(actor: Actor, command: Command) {
  const allowed = COMMAND_ROLES[command] as readonly Role[];
  if (!allowed.includes(actor.role)) {
    throw new AppError("FORBIDDEN");
  }
}

export function assertLecturer(actor: Actor): asserts actor is Extract<Actor, { role: "lecturer" }> {
  if (actor.role !== "lecturer") throw new AppError("FORBIDDEN");
}
export function assertStudent(actor: Actor): asserts actor is Extract<Actor, { role: "student" }> {
  if (actor.role !== "student") throw new AppError("FORBIDDEN");
}

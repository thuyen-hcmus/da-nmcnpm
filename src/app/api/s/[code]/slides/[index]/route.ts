import { db } from "@/server/db";
import { hashToken } from "@/server/auth/crypto";
import { json, route } from "@/server/http";
import { projectorTokenFor } from "@/server/projections";
import { publicSlide } from "@/server/services/session-service";
import { AppError } from "@/shared/errors";

/** Sinh viên/máy chiếu lấy một slide: cần token, chỉ slide đã công bố, không có ghi chú (FR-045). */
export const GET = route<{ code: string; index: string }>(async (req, { code, index }) => {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new AppError("UNAUTHENTICATED");
  const s = await db.session.findUnique({ where: { code: code.toUpperCase() } });
  if (!s) throw new AppError("NOT_FOUND");
  const p = await db.participant.findUnique({ where: { tokenHash: hashToken(token) } });
  const isParticipant = p?.sessionId === s.id;
  const isProjector = token === projectorTokenFor(s.id);
  if (!isParticipant && !isProjector) throw new AppError("UNAUTHENTICATED");
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0) throw new AppError("VALIDATION_ERROR");
  return json(await publicSlide(code, i));
});

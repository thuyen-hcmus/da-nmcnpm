import QRCode from "qrcode";
import { db } from "@/server/db";
import { requireLecturer, route } from "@/server/http";
import { joinUrl } from "@/server/urls";
import { AppError } from "@/shared/errors";

export const GET = route<{ id: string }>(async (_req, { id }) => {
  const u = await requireLecturer();
  const s = await db.session.findUnique({ where: { id } });
  if (!s) throw new AppError("NOT_FOUND");
  if (s.ownerId !== u.id) throw new AppError("FORBIDDEN");
  const svg = await QRCode.toString(joinUrl(s.code), { type: "svg", margin: 1 });
  return new Response(svg, { headers: { "content-type": "image/svg+xml" } });
});

import { notFound, redirect } from "next/navigation";
import { db } from "@/server/db";
import { currentUser } from "@/server/http";
import { Presenter } from "./Presenter";

export default async function PresentPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const user = await currentUser();
  if (!user) redirect("/login");
  const s = await db.session.findUnique({ where: { id: sessionId }, select: { ownerId: true, code: true, status: true, lectureId: true } });
  if (!s || s.ownerId !== user.id) notFound();
  if (s.status === "ENDED") redirect(`/sessions/${sessionId}/report`);
  return <Presenter sessionId={sessionId} code={s.code} lectureId={s.lectureId} />;
}

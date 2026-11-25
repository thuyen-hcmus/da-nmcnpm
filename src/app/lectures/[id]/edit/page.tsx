import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/server/http";
import { getLectureDetail } from "@/server/services/lecture-service";
import { AppError } from "@/shared/errors";
import { TopBar } from "@/client/components/TopBar";
import { Editor } from "./Editor";

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect("/login");
  let detail;
  try {
    detail = await getLectureDetail(user.id, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  return (
    <>
      <TopBar name={user.name} />
      <Editor initial={detail} />
    </>
  );
}

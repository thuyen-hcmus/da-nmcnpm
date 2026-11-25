import { redirect } from "next/navigation";
import { currentUser } from "@/server/http";
import { listLectures } from "@/server/services/lecture-service";
import { LectureList } from "./LectureList";
import { TopBar } from "@/client/components/TopBar";

export default async function LecturesPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const lectures = await listLectures(user.id);
  return (
    <>
      <TopBar name={user.name} />
      <LectureList initial={lectures} />
    </>
  );
}

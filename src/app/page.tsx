import { redirect } from "next/navigation";
import { currentUser } from "@/server/http";

export default async function Home() {
  const u = await currentUser();
  redirect(u ? "/lectures" : "/login");
}

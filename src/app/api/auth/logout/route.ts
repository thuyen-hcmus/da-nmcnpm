import { cookies } from "next/headers";
import { destroyAuthSession, SESSION_COOKIE } from "@/server/auth/lecturer-session";
import { route } from "@/server/http";

export const POST = route(async () => {
  const jar = await cookies();
  await destroyAuthSession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  return new Response(null, { status: 204 });
});

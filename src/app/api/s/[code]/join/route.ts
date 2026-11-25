import { json, parseBody, route } from "@/server/http";
import { joinSession } from "@/server/services/session-service";
import { joinInput } from "@/shared/contracts";

export const POST = route<{ code: string }>(async (req, { code }) => {
  const input = await parseBody(req, joinInput);
  return json(await joinSession(code, input));
});

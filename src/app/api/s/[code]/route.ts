import { json, route } from "@/server/http";
import { publicSessionInfo } from "@/server/services/session-service";

export const GET = route<{ code: string }>(async (_req, { code }) => json(await publicSessionInfo(code)));

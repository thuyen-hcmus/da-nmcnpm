import { json, requireLecturer, route } from "@/server/http";

export const GET = route(async () => json({ user: await requireLecturer() }));

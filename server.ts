/**
 * Custom server: Next.js (UI + REST) và Socket.IO (realtime) trên cùng một HTTP server,
 * dùng chung Prisma client và tầng dịch vụ → một nguồn trạng thái duy nhất (ADR-001).
 */
import { createServer } from "node:http";
import next from "next";

try {
  process.loadEnvFile?.(".env");
} catch {
  // không có .env: dùng biến môi trường sẵn có
}

const { env } = await import("./src/server/env");
const { createRealtime } = await import("./src/server/realtime");
const { log } = await import("./src/server/log");

const config = env();
const dev = config.NODE_ENV !== "production";
const app = next({ dev, hostname: config.HOST, port: config.PORT });
const handle = app.getRequestHandler();

await app.prepare();

const httpServer = createServer((req, res) => handle(req, res));
createRealtime(httpServer);

httpServer.listen(config.PORT, config.HOST, () => {
  log.info(`Sẵn sàng: http://${config.HOST}:${config.PORT} (PUBLIC_URL=${config.PUBLIC_URL}, AI=${config.AI_PROVIDER})`);
});

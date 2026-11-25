import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "rm -f e2e.db && DATABASE_URL=file:./e2e.db npx prisma migrate deploy && DATABASE_URL=file:./e2e.db npx tsx prisma/seed.ts && npx tsx server.ts",
    url: `http://localhost:${PORT}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      HOST: "localhost",
      PUBLIC_URL: `http://localhost:${PORT}`,
      DATABASE_URL: "file:./e2e.db",
      AI_PROVIDER: "fake",
      SESSION_SECRET: "e2e-secret-e2e-secret",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});

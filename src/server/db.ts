import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

function createClient() {
  const url = env().DATABASE_URL.replace(/^file:/, "");
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

/** Một Prisma client dùng chung cho Next route handler và Socket.IO (cùng tiến trình). */
export const db: PrismaClient = globalForPrisma.__prisma ?? (globalForPrisma.__prisma = createClient());

export type Db = PrismaClient;
export type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

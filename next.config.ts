import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;

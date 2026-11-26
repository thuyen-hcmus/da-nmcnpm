import type { NextConfig } from "next";

const publicUrl = process.env.PUBLIC_URL;
const publicHostname = publicUrl && URL.canParse(publicUrl) ? new URL(publicUrl).hostname : undefined;

const nextConfig: NextConfig = {
  allowedDevOrigins: publicHostname && !publicHostname.includes("*") ? [publicHostname] : undefined,
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;

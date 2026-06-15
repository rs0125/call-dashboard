import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma Client must not be bundled into serverless functions; mark external.
  serverExternalPackages: ["@prisma/client", "prisma"],
};

export default nextConfig;

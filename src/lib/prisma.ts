import { PrismaClient } from "@prisma/client";

// Reuse a single PrismaClient across hot reloads (dev) and warm serverless
// invocations. A new client per invocation would exhaust the pooler.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

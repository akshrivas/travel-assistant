import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

/**
 * Local: file:./dev.db (from .env)
 * Vercel/serverless: copy prepared SQLite into /tmp (writable) per instance.
 * Note: /tmp is ephemeral — session cookie + client backup are source of truth
 * for onboardingComplete across cold starts.
 */
function prepareDatabaseUrl(): string {
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const target = "/tmp/travel-assistant.db";
    const source = path.join(process.cwd(), "prisma", "deploy.db");
    try {
      // Reuse existing /tmp db if present so same instance keeps writes
      if (!fs.existsSync(target) && fs.existsSync(source)) {
        fs.copyFileSync(source, target);
      }
    } catch (err) {
      console.error("Failed to prepare /tmp sqlite", err);
    }
    return `file:${target}`;
  }
  return process.env.DATABASE_URL || "file:./dev.db";
}

process.env.DATABASE_URL = prepareDatabaseUrl();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

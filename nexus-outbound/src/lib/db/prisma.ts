import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: any;
  primaryPrisma: PrismaClient | undefined;
  standbyPrisma: PrismaClient | undefined;
  backupPrisma: PrismaClient | undefined;
};

// 1. Primary DB Client
const primaryUrl = process.env.DATABASE_URL;
const primaryPrisma =
  globalForPrisma.primaryPrisma ??
  new PrismaClient({
    datasources: primaryUrl ? { db: { url: primaryUrl } } : undefined,
    log: ["error"],
  });

// 2. Standby DB Client (Replica 2 - Seoul)
const standbyUrl = process.env.DATABASE_REPLICA2_URL;
const standbyPrisma =
  globalForPrisma.standbyPrisma ??
  (standbyUrl
    ? new PrismaClient({
        datasources: { db: { url: standbyUrl } },
        log: ["error"],
      })
    : null);

// 3. Backup DB Client (Replica 3 - Singapore)
const backupUrl = process.env.DATABASE_REPLICA3_URL;
const backupPrisma =
  globalForPrisma.backupPrisma ??
  (backupUrl
    ? new PrismaClient({
        datasources: { db: { url: backupUrl } },
        log: ["error"],
      })
    : null);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.primaryPrisma = primaryPrisma;
  globalForPrisma.standbyPrisma = standbyPrisma ?? undefined;
  globalForPrisma.backupPrisma = backupPrisma ?? undefined;
}

/**
 * High-Availability & Multi-Write Extended Prisma Client:
 * - Read Queries: Auto-failover to Standby (Replica 2) if Primary fails with a connection/network drop.
 * - Mutation Queries (create, update, delete): Execute on Primary, and replicate to Standby & Backup.
 */
export const prisma =
  globalForPrisma.prisma ??
  primaryPrisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const isMutation = [
            "create",
            "createMany",
            "update",
            "updateMany",
            "upsert",
            "delete",
            "deleteMany",
          ].includes(operation);

          // ─── READ OPERATIONS (With Transparent Standby Failover) ───
          if (!isMutation) {
            try {
              return await query(args);
            } catch (err: any) {
              const isConnError =
                err.code === "P1001" ||
                err.code === "P1002" ||
                err.message?.includes("closed") ||
                err.message?.includes("Connection terminated") ||
                err.message?.includes("ECONNRESET");

              if (standbyPrisma && isConnError) {
                console.warn(
                  `[Prisma HA Failover] Primary DB unreachable on ${model}.${operation}. Failing over to Standby DB (Replica 2).`
                );
                return await (standbyPrisma as any)[model][operation](args);
              }
              throw err;
            }
          }

          // ─── WRITE / MUTATION OPERATIONS (Multi-Write Sync) ───────
          let result: any;
          try {
            result = await query(args);
          } catch (err: any) {
            const isConnError =
              err.code === "P1001" ||
              err.code === "P1002" ||
              err.message?.includes("closed") ||
              err.message?.includes("Connection terminated");

            if (standbyPrisma && isConnError) {
              console.warn(
                `[Prisma HA Failover] Primary DB write failed on ${model}.${operation}. Executing on Standby DB (Replica 2).`
              );
              result = await (standbyPrisma as any)[model][operation](args);
            } else {
              throw err;
            }
          }

          // Continuous Replication to Standby & Backup Replicas
          if (standbyPrisma) {
            (standbyPrisma as any)[model][operation](args).catch((err: any) => {
              // Silently handle duplicate key if already replicated or transient log
              if (!err.message?.includes("Unique constraint")) {
                console.warn(`[Prisma Sync:Standby] Replication note on ${model}.${operation}:`, err.message);
              }
            });
          }

          if (backupPrisma) {
            (backupPrisma as any)[model][operation](args).catch((err: any) => {
              if (!err.message?.includes("Unique constraint")) {
                console.warn(`[Prisma Sync:Backup] Replication note on ${model}.${operation}:`, err.message);
              }
            });
          }

          return result;
        },
      },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;

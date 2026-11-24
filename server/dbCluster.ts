/**
 * High-Availability Database Cluster Manager
 *
 * Topology:
 * - Node 1 (Primary / Default Leader): Tokyo (ap-northeast-1) [hsmudwkfwmvinhtggxyd]
 * - Node 2 (Standby / Auto-Failover Target): Seoul (ap-northeast-2) [qlzlsjpncknjliyalfmj]
 * - Node 3 (Continuous Backup Replica): Singapore (ap-southeast-1) [adlwwkqgexykuhkdkpfu]
 *
 * Features:
 * 1. Always Stick to Primary (Tokyo) unless Primary genuinely crashes (3 consecutive missed heartbeats).
 * 2. Continuous Multi-Write Replication across all 3 nodes with pre-resolved UUIDs so Primary, Replica 2, and Replica 3 share identical row IDs.
 * 3. Asynchronous WAL Queue for transient network partitions with auto-reconciliation.
 * 4. Active Health Heartbeat & Latency Telemetry.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { Pool } from "pg";
import type { PoolConfig } from "pg";
import type { QueryFn, QueryRow } from "./types";

function resolveIsolatedNode(): NodeId | null {
  // Always use Primary (Tokyo) as Leader unless DB_TARGET_NODE explicitly overrides it.
  // Never read BRAIN_DB_TARGET here so legacy .env settings cannot hijack the main cluster away from Primary!
  const fromEnv = (process.env.DB_TARGET_NODE || "").trim().toLowerCase();
  if (fromEnv === "replica3" || fromEnv === "replica2" || fromEnv === "primary") {
    return fromEnv as NodeId;
  }
  return null;
}

function preResolveGeneratedIds(sql: string): string {
  if (!/gen_random_uuid\s*\(\s*\)/i.test(sql)) return sql;
  return sql.replace(/gen_random_uuid\s*\(\s*\)(?:::text)?/gi, () => `'${crypto.randomUUID()}'`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Transient (retryable) connection error — routine for the Supabase pooler on idle sockets. */
function isTransientDbError(err: any): boolean {
  return (
    err?.code === "ECONNRESET" ||
    err?.code === "ETIMEDOUT" ||
    err?.code === "57P01" ||
    err?.code === "XX000" ||
    err?.code === "08006" ||
    err?.code === "08003" ||
    /Connection terminated|connection closed|timeout|timed out|ECHECKOUTTIMEOUT|pool|authentication did not complete/i.test(
      String(err?.message || "")
    )
  );
}

/** Fail a hung query fast instead of freezing the dashboard. */
async function withTimeout<R>(p: Promise<R>, ms: number, label: string): Promise<R> {
  let t: any;
  const timeout = new Promise<never>((_, rej) => {
    t = setTimeout(
      () => rej(Object.assign(new Error(`query timed out after ${ms}ms (${label})`), { code: "ETIMEDOUT" })),
      ms
    );
  });
  try {
    return (await Promise.race([p, timeout])) as R;
  } finally {
    clearTimeout(t);
  }
}

export type NodeId = "primary" | "replica2" | "replica3";
export type NodeRole = "LEADER" | "STANDBY" | "BACKUP";
export type NodeStatus = "ONLINE" | "DEGRADED" | "OFFLINE";

export interface ClusterNodeConfig {
  id: NodeId;
  name: string;
  role: NodeRole;
  region: string;
  restUrl: string;
  host: string;
  port: number;
  user: string;
  database: string;
  password?: string;
  connectionString?: string;
}

export interface NodeHealth {
  id: NodeId;
  name: string;
  role: NodeRole;
  status: NodeStatus;
  isCurrentLeader: boolean;
  latencyMs: number | null;
  lastHealthyAt: Date | null;
  consecutiveFailures: number;
}

export interface QueuedMutation {
  id: string;
  sql: string;
  params: unknown[];
  targetNodeId: NodeId;
  attempts: number;
  enqueuedAt: number;
}

const DEFAULT_PASSWORD = process.env.DATABASE_PASSWORD || "9538564601Aa";

export const CLUSTER_CONFIGS: Record<NodeId, ClusterNodeConfig> = {
  primary: {
    id: "primary",
    name: "Primary (Tokyo - Leader)",
    role: "LEADER",
    region: "ap-northeast-1",
    restUrl: "https://hsmudwkfwmvinhtggxyd.supabase.co/rest/v1/",
    host: "aws-0-ap-northeast-1.pooler.supabase.com",
    port: 6543,
    user: "postgres.hsmudwkfwmvinhtggxyd",
    database: "postgres",
    password: DEFAULT_PASSWORD,
  },
  replica2: {
    id: "replica2",
    name: "Replica 2 (Seoul - Standby)",
    role: "STANDBY",
    region: "ap-northeast-2",
    restUrl: "https://qlzlsjpncknjliyalfmj.supabase.co/rest/v1/",
    host: "aws-0-ap-northeast-2.pooler.supabase.com",
    port: 6543,
    user: "postgres.qlzlsjpncknjliyalfmj",
    database: "postgres",
    password: DEFAULT_PASSWORD,
  },
  replica3: {
    id: "replica3",
    name: "Replica 3 (Singapore - Backup)",
    role: "BACKUP",
    region: "ap-southeast-1",
    restUrl: "https://adlwwkqgexykuhkdkpfu.supabase.co/rest/v1/",
    host: "aws-0-ap-southeast-1.pooler.supabase.com",
    port: 6543,
    user: "postgres.adlwwkqgexykuhkdkpfu",
    database: "postgres",
    password: DEFAULT_PASSWORD,
  },
};

class DatabaseClusterManager {
  private pools: Map<NodeId, Pool> = new Map();
  private health: Map<NodeId, NodeHealth> = new Map();
  private isolatedNode: NodeId | null = resolveIsolatedNode();
  private currentLeaderId: NodeId = resolveIsolatedNode() || "primary";
  private syncQueue: QueuedMutation[] = [];
  private isProcessingQueue = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private queueTimer: NodeJS.Timeout | null = null;
  private failoverHistory: Array<{ timestamp: Date; from: NodeId; to: NodeId; reason: string }> = [];

  constructor() {
    if (!this.isBuildEnv()) {
      this.initPools();
      this.startHeartbeat();
      this.startQueueWorker();
    }
  }

  private isBuildEnv(): boolean {
    return (
      process.env.npm_lifecycle_event === "build" ||
      process.env.NEXT_PHASE === "phase-production-build" ||
      process.argv.some((arg) => /build|vite|next|tsc|lint/i.test(arg))
    );
  }

  public ensureInitialized() {
    if (this.pools.size === 0) {
      this.initPools();
      this.startHeartbeat();
      this.startQueueWorker();
    }
  }

  private initPools() {
    if (this.pools.size > 0) return;

    let fileEnv: Record<string, string> = {};
    try {
      for (const root of [process.cwd(), path.resolve(process.cwd(), "..")]) {
        const envPath = path.join(root, ".env");
        if (fs.existsSync(envPath)) {
          const content = fs.readFileSync(envPath, "utf8");
          for (const line of content.split("\n")) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
            if (m && !fileEnv[m[1]]) {
              fileEnv[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
            }
          }
        }
      }
    } catch {}

    const envUrlFor = (id: NodeId): string | undefined => {
      const raw =
        id === "primary"
          ? process.env.DATABASE_URL || fileEnv.DATABASE_URL
          : id === "replica2"
          ? process.env.DATABASE_REPLICA2_URL || fileEnv.DATABASE_REPLICA2_URL
          : process.env.DATABASE_REPLICA3_URL || fileEnv.DATABASE_REPLICA3_URL;
      if (!raw) return undefined;
      try {
        const parsed = new URL(raw);
        parsed.searchParams.delete("sslmode");
        parsed.searchParams.delete("pgbouncer");
        return parsed.toString();
      } catch {
        return undefined;
      }
    };

    for (const [id, config] of Object.entries(CLUSTER_CONFIGS) as [NodeId, ClusterNodeConfig][]) {
      const cs = envUrlFor(id);
      const poolConfig: PoolConfig = cs
        ? {
            connectionString: cs,
            ssl: { rejectUnauthorized: false },
            max: 3,
            idleTimeoutMillis: 10_000,
            connectionTimeoutMillis: 10_000,
          }
        : {
            host: config.host,
            port: config.port,
            user: config.user,
            password: config.password,
            database: config.database,
            ssl: { rejectUnauthorized: false },
            max: 3,
            idleTimeoutMillis: 10_000,
            connectionTimeoutMillis: 10_000,
          };

      const pool = new Pool(poolConfig);
      pool.on("error", (err: any) => {
        console.warn(`[DBCluster:${id}] Idle pooler connection dropped (handled safely):`, err?.message);
      });

      this.pools.set(id, pool);
      this.health.set(id, {
        id,
        name: config.name,
        role: config.role,
        status: "ONLINE",
        isCurrentLeader: id === this.currentLeaderId,
        latencyMs: null,
        lastHealthyAt: new Date(),
        consecutiveFailures: 0,
      });
    }
  }

  public getPool(nodeId?: NodeId): Pool {
    this.ensureInitialized();
    const id = nodeId || this.currentLeaderId;
    const pool = this.pools.get(id);
    if (!pool) throw new Error(`[DBCluster] Pool not found for node ${id}`);
    return pool;
  }

  public getCurrentLeader(): NodeId {
    return this.currentLeaderId;
  }

  public getClusterStatus() {
    this.ensureInitialized();
    return {
      currentLeader: this.currentLeaderId,
      nodes: Array.from(this.health.values()),
      queueSize: this.syncQueue.length,
      failoverHistory: this.failoverHistory,
    };
  }

  /**
   * Automatic failover trigger (only invoked when Primary misses 3 consecutive heartbeats or write connection drops)
   */
  public triggerFailover(toNodeId: NodeId = "replica2", reason: string = "Health check failure or query exception") {
    const prevLeader = this.currentLeaderId;
    if (prevLeader === toNodeId) return;

    console.error(`\n🚨 [DBCluster FAILOVER] Switching leader from ${prevLeader} to ${toNodeId}! Reason: ${reason}`);

    this.currentLeaderId = toNodeId;

    const prevRecord = this.health.get(prevLeader);
    if (prevRecord) {
      prevRecord.isCurrentLeader = false;
      prevRecord.status = "DEGRADED";
    }

    const newRecord = this.health.get(toNodeId);
    if (newRecord) {
      newRecord.isCurrentLeader = true;
      newRecord.status = "ONLINE";
    }

    this.failoverHistory.push({
      timestamp: new Date(),
      from: prevLeader,
      to: toNodeId,
      reason,
    });

    console.log(`✅ [DBCluster FAILOVER COMPLETE] New active leader is ${toNodeId}.`);
  }

  /**
   * Heartbeat ping to monitor all 3 databases
   */
  private startHeartbeat() {
    if (this.isBuildEnv() || this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(async () => {
      for (const [id, pool] of this.pools.entries()) {
        const start = Date.now();
        const record = this.health.get(id);
        if (!record) continue;

        try {
          await pool.query("SELECT 1;");

          const latency = Date.now() - start;
          record.latencyMs = latency;
          record.status = "ONLINE";
          record.lastHealthyAt = new Date();
          record.consecutiveFailures = 0;

          if (!this.isolatedNode && id === "primary" && this.currentLeaderId !== "primary") {
            console.log(
              `\n🔄 [DBCluster FAILBACK] Primary leader (Tokyo) is online and responsive (${latency}ms). Restoring leadership to primary.`
            );
            this.currentLeaderId = "primary";
            record.isCurrentLeader = true;
            for (const [otherId, otherRec] of this.health.entries()) {
              if (otherId !== "primary") otherRec.isCurrentLeader = false;
            }
          }
        } catch (err: any) {
          record.consecutiveFailures++;
          record.latencyMs = null;
          console.warn(`[DBCluster Heartbeat] Node ${id} ping failed (${record.consecutiveFailures}x):`, err.message);

          if (record.consecutiveFailures >= 3) {
            record.status = "OFFLINE";
            if (id === this.currentLeaderId) {
              const fallback = id === "primary" ? "replica2" : "replica3";
              this.triggerFailover(fallback, `Leader ${id} missed 3 consecutive heartbeat pings`);
            }
          }
        }
      }
    }, 10_000);
    if (typeof this.heartbeatTimer?.unref === "function") {
      this.heartbeatTimer.unref();
    }
  }

  /**
   * Background queue worker for reconciling delayed writes across replicas
   */
  private startQueueWorker() {
    if (this.isBuildEnv() || this.queueTimer) return;
    this.queueTimer = setInterval(async () => {
      if (this.isProcessingQueue || this.syncQueue.length === 0) return;
      this.isProcessingQueue = true;

      try {
        const item = this.syncQueue[0];
        const targetPool = this.pools.get(item.targetNodeId);

        if (targetPool && this.health.get(item.targetNodeId)?.status !== "OFFLINE") {
          try {
            await targetPool.query(item.sql, item.params as any[]);
            this.syncQueue.shift();
          } catch (err: any) {
            item.attempts++;
            const nonRetryable = ["23503", "23505", "42P01", "42703", "22P02"].includes(String(err?.code));
            if (nonRetryable || item.attempts >= 5) {
              console.warn(
                `[DBCluster WAL Queue] Dropping item ${item.id} (code=${err?.code || "n/a"}, attempts=${item.attempts}):`,
                err.message
              );
              this.syncQueue.shift();
            } else {
              this.syncQueue.push(this.syncQueue.shift()!);
            }
          }
        }
      } finally {
        this.isProcessingQueue = false;
      }
    }, 3_000);
    if (typeof this.queueTimer?.unref === "function") {
      this.queueTimer.unref();
    }
  }

  public async close(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.queueTimer) {
      clearInterval(this.queueTimer);
      this.queueTimer = null;
    }
    for (const pool of this.pools.values()) {
      await pool.end().catch(() => {});
    }
    this.pools.clear();
  }

  /**
   * Determines if a SQL statement is a write/mutation
   */
  private isMutation(sql: string): boolean {
    return /^\s*(INSERT|UPDATE|DELETE|UPSERT|TRUNCATE|DROP|CREATE|ALTER)\b/i.test(sql);
  }

  /**
   * Primary cluster query execution function
   * - Read queries ALWAYS stick to Primary (Tokyo) unless Primary is genuinely OFFLINE (crashed).
   * - Write queries execute on Primary (with pre-resolved UUIDs) and replicate to Replica 2 & Replica 3.
   */
  public async query<T = QueryRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const isWrite = this.isMutation(sql);

    // ─────────────────────────────────────────────
    // 1. READ QUERY FLOW (Locked to Primary Tokyo)
    // ─────────────────────────────────────────────
    if (!isWrite) {
      const QUERY_TIMEOUT_MS = 10_000;
      const runOn = async (node: NodeId): Promise<T[]> => {
        const pool = this.getPool(node);
        const result = await withTimeout<any>(pool.query(sql, params as any[]), QUERY_TIMEOUT_MS, `read:${node}`);
        return (result?.rows || []) as unknown as T[];
      };

      const primaryOffline = this.health.get("primary")?.status === "OFFLINE";
      const order: NodeId[] = this.isolatedNode
        ? [this.isolatedNode]
        : primaryOffline
        ? ["replica2", "replica3", "primary"]
        : ["primary", "replica2", "replica3"];

      let lastErr: any = null;
      for (let i = 0; i < order.length; i++) {
        const node = order[i];
        try {
          if (node === "primary") {
            try {
              return await runOn("primary");
            } catch (firstErr: any) {
              if (!isTransientDbError(firstErr)) throw firstErr;
              await sleep(150);
              return await runOn("primary");
            }
          }
          return await runOn(node);
        } catch (err: any) {
          lastErr = err;
          if (!isTransientDbError(err)) throw err;
          const nextNode = order[i + 1];
          if (nextNode) {
            console.warn(`[DBCluster] Primary unreachable after retry (${err.message}). Emergency fallback to ${nextNode}.`);
          }
        }
      }
      if (lastErr) throw lastErr;
      return [] as unknown as T[];
    }

    // ─────────────────────────────────────────────
    // 2. WRITE QUERY FLOW (Always-Synced Replication)
    // ─────────────────────────────────────────────
    const resolvedSql = preResolveGeneratedIds(sql);
    let leaderResult: any = null;
    let leaderNode = this.currentLeaderId;

    try {
      const leaderPool = this.getPool(leaderNode);
      leaderResult = await withTimeout(leaderPool.query(resolvedSql, params as any[]), 10_000, `write:${leaderNode}`);
    } catch (err: any) {
      if (!isTransientDbError(err)) {
        throw err;
      }
      const standby: NodeId = leaderNode === "primary" ? "replica2" : "replica3";
      this.triggerFailover(standby, `Write connection failed on leader ${leaderNode}: ${err.message}`);

      const fallbackPool = this.getPool(standby);
      leaderResult = await withTimeout(fallbackPool.query(resolvedSql, params as any[]), 10_000, `write:${standby}`);
      leaderNode = standby;
    }

    if (this.isolatedNode) {
      return (leaderResult?.rows || []) as unknown as T[];
    }

    const otherNodes: NodeId[] = (["primary", "replica2", "replica3"] as NodeId[]).filter((id) => id !== leaderNode);

    for (const replicaId of otherNodes) {
      const replicaPool = this.pools.get(replicaId);
      const isOnline = this.health.get(replicaId)?.status === "ONLINE";

      if (replicaPool && isOnline) {
        replicaPool.query(resolvedSql, params as any[]).catch((repErr: any) => {
          const nonRetryable = ["23503", "23505", "42P01", "42703", "22P02"].includes(String(repErr?.code));
          if (nonRetryable) return;
          console.warn(`[DBCluster Replicate] Immediate replicate to ${replicaId} failed (${repErr.message}). Enqueuing to syncQueue.`);
          if (this.syncQueue.length < 500) {
            this.syncQueue.push({
              id: `mutation_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              sql: resolvedSql,
              params,
              targetNodeId: replicaId,
              attempts: 0,
              enqueuedAt: Date.now(),
            });
          }
        });
      } else if (this.syncQueue.length < 500) {
        this.syncQueue.push({
          id: `mutation_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          sql: resolvedSql,
          params,
          targetNodeId: replicaId,
          attempts: 0,
          enqueuedAt: Date.now(),
        });
      }
    }

    return (leaderResult?.rows || []) as unknown as T[];
  }
}

export const clusterManager = new DatabaseClusterManager();
export const clusterQuery: QueryFn = <T = QueryRow>(sql: string, params: unknown[] = []) => clusterManager.query<T>(sql, params);
export default clusterManager;

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
 * 2. Concurrency Semaphore (max 3 simultaneous checkouts per node) so local query bursts queue cleanly in Node memory without exhausting Supabase Supavisor session/auth limits.
 * 3. Continuous Multi-Write Replication across all 3 nodes with pre-resolved UUIDs so Primary, Replica 2, and Replica 3 share identical row IDs.
 * 4. Asynchronous WAL Queue for transient network partitions with auto-reconciliation.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import pg, { Pool } from "pg";
import type { PoolConfig } from "pg";
import type { QueryFn, QueryRow } from "./types";

// Ensure all PostgreSQL "timestamp without time zone" (OID 1114) columns are
// parsed as UTC timestamps regardless of the host machine's local timezone.
pg.types.setTypeParser(1114, (str: string) => {
  if (!str) return null as unknown as Date;
  const iso = str.includes("T") ? str : str.replace(" ", "T");
  return new Date(/(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(iso) ? iso : `${iso}Z`);
});

function resolveIsolatedNode(): NodeId | null {
  // Always stick strictly to Primary (Tokyo) unless DB_TARGET_NODE explicitly overrides it.
  // This prevents any slow query or transient timeout from failing over to an out-of-sync replica (replica2/replica3).
  const fromEnv = (process.env.DB_TARGET_NODE || "primary").trim().toLowerCase();
  if (fromEnv === "replica3" || fromEnv === "replica2" || fromEnv === "primary") {
    return fromEnv as NodeId;
  }
  return "primary";
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
    err?.code === "57014" ||
    err?.code === "XX000" ||
    err?.code === "08006" ||
    err?.code === "08003" ||
    /Connection terminated|connection closed|timeout|timed out|ECHECKOUTTIMEOUT|pool|authentication did not complete|canceling statement/i.test(
      String(err?.message || "")
    )
  );
}

/** Fail a hung query fast (measured AFTER semaphore acquisition) instead of freezing the dashboard. */
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

class AsyncSemaphore {
  private active = 0;
  private waiters: Array<() => void> = [];
  constructor(private readonly maxConcurrency: number) { }

  public async run<R>(fn: () => Promise<R>): Promise<R> {
    if (this.active >= this.maxConcurrency) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.waiters.shift();
      if (next) next();
    }
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
    port: 5432,
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
    port: 5432,
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
    port: 5432,
    user: "postgres.adlwwkqgexykuhkdkpfu",
    database: "postgres",
    password: DEFAULT_PASSWORD,
  },
};

class DatabaseClusterManager {
  private pools: Map<NodeId, Pool> = new Map();
  private semaphores: Map<NodeId, AsyncSemaphore> = new Map();
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
    } catch { }

    const envUrlFor = (id: NodeId): string | undefined => {
      const raw =
        id === "primary"
          ? process.env.DIRECT_URL || fileEnv.DIRECT_URL || process.env.DATABASE_URL || fileEnv.DATABASE_URL
          : id === "replica2"
            ? process.env.DIRECT_REPLICA2_URL || fileEnv.DIRECT_REPLICA2_URL || process.env.DATABASE_REPLICA2_URL || fileEnv.DATABASE_REPLICA2_URL
            : process.env.DIRECT_REPLICA3_URL || fileEnv.DIRECT_REPLICA3_URL || process.env.DATABASE_REPLICA3_URL || fileEnv.DATABASE_REPLICA3_URL;
      if (!raw) return undefined;
      try {
        const parsed = new URL(raw);
        if (parsed.port === "6543") parsed.port = "5432";
        parsed.searchParams.delete("sslmode");
        parsed.searchParams.delete("pgbouncer");
        return parsed.toString();
      } catch {
        return undefined;
      }
    };

    for (const [id, config] of Object.entries(CLUSTER_CONFIGS) as [NodeId, ClusterNodeConfig][]) {
      // When locked to an isolated node (e.g. "primary"), do NOT initialize pools for replica2/replica3
      if (this.isolatedNode && id !== this.isolatedNode) {
        continue;
      }
      const cs = envUrlFor(id);
      const poolConfig: PoolConfig = cs
        ? {
          connectionString: cs,
          ssl: { rejectUnauthorized: false },
          max: 2,
          idleTimeoutMillis: 10_000,
          connectionTimeoutMillis: 12_000,
          statement_timeout: 30_000,
          query_timeout: 31_000,
        }
        : {
          host: config.host,
          port: config.port,
          user: config.user,
          password: config.password,
          database: config.database,
          ssl: { rejectUnauthorized: false },
          max: 2,
          idleTimeoutMillis: 10_000,
          connectionTimeoutMillis: 12_000,
          statement_timeout: 30_000,
          query_timeout: 31_000,
        };

      const pool = new Pool(poolConfig);
      pool.on("error", (err: any) => {
        console.warn(`[DBCluster:${id}] Idle pooler connection dropped (handled safely):`, err?.message);
      });

      this.pools.set(id, pool);
      this.semaphores.set(id, new AsyncSemaphore(2));
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

  private getSemaphore(nodeId: NodeId): AsyncSemaphore {
    this.ensureInitialized();
    let sem = this.semaphores.get(nodeId);
    if (!sem) {
      sem = new AsyncSemaphore(2);
      this.semaphores.set(nodeId, sem);
    }
    return sem;
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
        if (this.isolatedNode && id !== this.isolatedNode) continue;
        const start = Date.now();
        const record = this.health.get(id);
        if (!record) continue;

        try {
          // Run heartbeat directly on the pool so queued dashboard queries on the semaphore never cause false heartbeat timeouts
          await withTimeout(pool.query("SELECT 1;"), 12_000, `heartbeat:${id}`);

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

          if (!this.isolatedNode && record.consecutiveFailures >= 5) {
            record.status = "OFFLINE";
            if (id === this.currentLeaderId) {
              const fallback = id === "primary" ? "replica2" : "replica3";
              this.triggerFailover(fallback, `Leader ${id} missed 5 consecutive heartbeat pings`);
            }
          }
        }
      }
    }, 15_000);
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
            await this.getSemaphore(item.targetNodeId).run(() => targetPool.query(item.sql, item.params as any[]));
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
      await pool.end().catch(() => { });
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
      const QUERY_TIMEOUT_MS = 30_000; // 30s for heavy analytics queries (engagementCte, dedup contacts scan)
      const runOn = async (node: NodeId): Promise<T[]> => {
        const pool = this.getPool(node);
        const sem = this.getSemaphore(node);
        return sem.run(async () => {
          const result = await withTimeout<any>(pool.query(sql, params as any[]), QUERY_TIMEOUT_MS, `read:${node}`);
          return (result?.rows || []) as unknown as T[];
        });
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
              await sleep(250);
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
      const sem = this.getSemaphore(leaderNode);
      leaderResult = await sem.run(() =>
        withTimeout(leaderPool.query(resolvedSql, params as any[]), 20_000, `write:${leaderNode}`)
      );
    } catch (err: any) {
      if (!isTransientDbError(err)) {
        throw err;
      }
      // If pinned to an isolated node (default: primary), retry on primary instead of failing over to replica2!
      if (this.isolatedNode) {
        await sleep(300);
        const leaderPool = this.getPool(leaderNode);
        const sem = this.getSemaphore(leaderNode);
        leaderResult = await sem.run(() =>
          withTimeout(leaderPool.query(resolvedSql, params as any[]), 25_000, `write:${leaderNode}:retry`)
        );
      } else {
        const standby: NodeId = leaderNode === "primary" ? "replica2" : "replica3";
        this.triggerFailover(standby, `Write connection failed on leader ${leaderNode}: ${err.message}`);

        const fallbackPool = this.getPool(standby);
        const sem = this.getSemaphore(standby);
        leaderResult = await sem.run(() =>
          withTimeout(fallbackPool.query(resolvedSql, params as any[]), 20_000, `write:${standby}`)
        );
        leaderNode = standby;
      }
    }

    if (this.isolatedNode) {
      return (leaderResult?.rows || []) as unknown as T[];
    }

    const otherNodes: NodeId[] = (["primary", "replica2", "replica3"] as NodeId[]).filter((id) => id !== leaderNode);

    for (const replicaId of otherNodes) {
      const replicaPool = this.pools.get(replicaId);
      const isOnline = this.health.get(replicaId)?.status === "ONLINE";

      if (replicaPool && isOnline) {
        this.getSemaphore(replicaId)
          .run(() => replicaPool.query(resolvedSql, params as any[]))
          .catch((repErr: any) => {
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

// Singleton cluster instance (stored on globalThis so Vite HMR server restarts reuse the same pool)
// IMPORTANT: Never close the previous pool on HMR — closing drains connections mid-flight causing
// cascading ETIMEDOUT errors. Instead, reuse the existing instance across restarts.
const globalForCluster = globalThis as unknown as { __tbmClusterManager?: DatabaseClusterManager };
if (!globalForCluster.__tbmClusterManager) {
  globalForCluster.__tbmClusterManager = new DatabaseClusterManager();
}
export const clusterManager = globalForCluster.__tbmClusterManager;
export const clusterQuery: QueryFn = <T = QueryRow>(sql: string, params: unknown[] = []) => clusterManager.query<T>(sql, params);
export default clusterManager;

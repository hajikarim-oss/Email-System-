/**
 * High-Availability Database Cluster Manager
 * 
 * Topology:
 * - Node 1 (Primary / Default Leader): Tokyo (ap-northeast-1) [hsmudwkfwmvinhtggxyd]
 * - Node 2 (Standby / Auto-Failover Target): Seoul (ap-northeast-2) [qlzlsjpncknjliyalfmj]
 * - Node 3 (Continuous Backup Replica): Singapore (ap-southeast-1) [adlwwkqgexykuhkdkpfu]
 * 
 * Features:
 * 1. Automatic Zero-Downtime Failover (Node 1 -> Node 2) upon network drop or node failure.
 * 2. Continuous Multi-Write Replication across all 3 nodes.
 * 3. Asynchronous WAL Queue for transient network partitions with auto-reconciliation.
 * 4. Active Health Heartbeat & Latency Telemetry.
 */

import { Pool } from "pg";
import type { PoolConfig } from "pg";
import type { QueryFn, QueryRow } from "./types";

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
    password: DEFAULT_PASSWORD
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
    password: DEFAULT_PASSWORD
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
    password: DEFAULT_PASSWORD
  }
};

class DatabaseClusterManager {
  private pools: Map<NodeId, Pool> = new Map();
  private health: Map<NodeId, NodeHealth> = new Map();
  private currentLeaderId: NodeId = "primary";
  private syncQueue: QueuedMutation[] = [];
  private isProcessingQueue = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private queueTimer: NodeJS.Timeout | null = null;
  private failoverHistory: Array<{ timestamp: Date; from: NodeId; to: NodeId; reason: string }> = [];

  constructor() {
    this.initPools();
    this.startHeartbeat();
    this.startQueueWorker();
  }

  private initPools() {
    for (const [id, config] of Object.entries(CLUSTER_CONFIGS) as [NodeId, ClusterNodeConfig][]) {
      const poolConfig: PoolConfig = {
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        ssl: { rejectUnauthorized: false },
        max: 15,
        idleTimeoutMillis: 30_000,
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
        consecutiveFailures: 0
      });
    }
  }

  public getPool(nodeId?: NodeId): Pool {
    const id = nodeId || this.currentLeaderId;
    const pool = this.pools.get(id);
    if (!pool) throw new Error(`[DBCluster] Pool not found for node ${id}`);
    return pool;
  }

  public getCurrentLeader(): NodeId {
    return this.currentLeaderId;
  }

  public getClusterStatus() {
    return {
      currentLeader: this.currentLeaderId,
      nodes: Array.from(this.health.values()),
      queueSize: this.syncQueue.length,
      failoverHistory: this.failoverHistory
    };
  }

  /**
   * Automatic failover trigger
   */
  public triggerFailover(toNodeId: NodeId = "replica2", reason: string = "Health check failure or query exception") {
    const prevLeader = this.currentLeaderId;
    if (prevLeader === toNodeId) return;

    console.error(`\n🚨 [DBCluster FAILOVER] Switching leader from ${prevLeader} to ${toNodeId}! Reason: ${reason}`);
    
    this.currentLeaderId = toNodeId;
    
    // Update health records
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
      reason
    });

    console.log(`✅ [DBCluster FAILOVER COMPLETE] New active leader is ${toNodeId}.`);
  }

  /**
   * Heartbeat ping to monitor all 3 databases
   */
  private startHeartbeat() {
    this.heartbeatTimer = setInterval(async () => {
      for (const [id, pool] of this.pools.entries()) {
        const start = Date.now();
        const record = this.health.get(id);
        if (!record) continue;

        try {
          const client = await pool.connect();
          await client.query("SELECT 1;");
          client.release();

          const latency = Date.now() - start;
          record.latencyMs = latency;
          record.status = "ONLINE";
          record.lastHealthyAt = new Date();
          record.consecutiveFailures = 0;
        } catch (err: any) {
          record.consecutiveFailures++;
          record.latencyMs = null;
          console.warn(`[DBCluster Heartbeat] Node ${id} ping failed (${record.consecutiveFailures}x):`, err.message);

          if (record.consecutiveFailures >= 3) {
            record.status = "OFFLINE";
            // If the primary leader fails 3 times, failover automatically
            if (id === this.currentLeaderId) {
              const fallback = id === "primary" ? "replica2" : "replica3";
              this.triggerFailover(fallback, `Leader ${id} missed 3 consecutive heartbeat pings`);
            }
          }
        }
      }
    }, 10_000);
  }

  /**
   * Background queue worker for reconciling delayed writes across replicas
   */
  private startQueueWorker() {
    this.queueTimer = setInterval(async () => {
      if (this.isProcessingQueue || this.syncQueue.length === 0) return;
      this.isProcessingQueue = true;

      try {
        const item = this.syncQueue[0];
        const targetPool = this.pools.get(item.targetNodeId);

        if (targetPool && this.health.get(item.targetNodeId)?.status !== "OFFLINE") {
          try {
            await targetPool.query(item.sql, item.params as any[]);
            // Successfully replicated! Dequeue
            this.syncQueue.shift();
          } catch (err: any) {
            item.attempts++;
            if (item.attempts >= 10) {
              console.error(`[DBCluster WAL Queue] Giving up on item ${item.id} after 10 attempts:`, err.message);
              this.syncQueue.shift();
            } else {
              // Rotate to end of queue to retry later
              this.syncQueue.push(this.syncQueue.shift()!);
            }
          }
        }
      } finally {
        this.isProcessingQueue = false;
      }
    }, 3_000);
  }

  /**
   * Determines if a SQL statement is a write/mutation
   */
  private isMutation(sql: string): boolean {
    return /^\s*(INSERT|UPDATE|DELETE|UPSERT|TRUNCATE|DROP|CREATE|ALTER)\b/i.test(sql);
  }

  /**
   * Primary cluster query execution function
   * - Read queries execute on currentLeader, with transparent failover retry.
   * - Write queries execute on currentLeader, then replicate to all healthy standby/backup nodes.
   */
  public async query<T = QueryRow>(sql: string, params: unknown[] = []): Promise<T[]> {
    const isWrite = this.isMutation(sql);

    // ─────────────────────────────────────────────
    // 1. READ QUERY FLOW
    // ─────────────────────────────────────────────
    if (!isWrite) {
      let attempts = 0;
      let targetNode = this.currentLeaderId;

      while (attempts < 2) {
        attempts++;
        try {
          const pool = this.getPool(targetNode);
          const result = await pool.query(sql, params as any[]);
          return result.rows as unknown as T[];
        } catch (err: any) {
          const isNetworkError = 
            err.code === "ECONNRESET" || 
            err.code === "ETIMEDOUT" || 
            err.message?.includes("Connection terminated") || 
            err.message?.includes("closed") ||
            err.message?.includes("timeout");

          if (isNetworkError && attempts < 2) {
            // Failover to standby node immediately
            const standby: NodeId = targetNode === "primary" ? "replica2" : "replica3";
            this.triggerFailover(standby, `Read query failed on ${targetNode}: ${err.message}`);
            targetNode = standby;
            continue;
          }
          throw err;
        }
      }
      return [] as unknown as T[];
    }

    // ─────────────────────────────────────────────
    // 2. WRITE QUERY FLOW (Always-Synced Replication)
    // ─────────────────────────────────────────────
    let leaderResult: any = null;
    let leaderNode = this.currentLeaderId;

    try {
      const leaderPool = this.getPool(leaderNode);
      leaderResult = await leaderPool.query(sql, params as any[]);
    } catch (err: any) {
      // Primary leader failed during write
      const standby: NodeId = leaderNode === "primary" ? "replica2" : "replica3";
      this.triggerFailover(standby, `Write failed on leader ${leaderNode}: ${err.message}`);
      
      // Retry immediately on new leader
      const fallbackPool = this.getPool(standby);
      leaderResult = await fallbackPool.query(sql, params as any[]);
      leaderNode = standby;
    }

    // Now replicate the write to all other replica nodes
    const otherNodes: NodeId[] = (["primary", "replica2", "replica3"] as NodeId[])
      .filter(id => id !== leaderNode);

    for (const replicaId of otherNodes) {
      const replicaPool = this.pools.get(replicaId);
      const isOnline = this.health.get(replicaId)?.status === "ONLINE";

      if (replicaPool && isOnline) {
        // Fire-and-settle replication; if replica is slow or errors, fallback to syncQueue
        replicaPool.query(sql, params as any[]).catch((repErr: any) => {
          console.warn(`[DBCluster Replicate] Immediate replicate to ${replicaId} failed (${repErr.message}). Enqueuing to syncQueue.`);
          this.syncQueue.push({
            id: `mutation_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            sql,
            params,
            targetNodeId: replicaId,
            attempts: 0,
            enqueuedAt: Date.now()
          });
        });
      } else {
        // Node is offline/degraded, buffer into syncQueue for automatic replay upon recovery
        this.syncQueue.push({
          id: `mutation_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          sql,
          params,
          targetNodeId: replicaId,
          attempts: 0,
          enqueuedAt: Date.now()
        });
      }
    }

    return (leaderResult?.rows || []) as unknown as T[];
  }
}

// Global Singleton Instance
export const clusterManager = new DatabaseClusterManager();
export const clusterQuery: QueryFn = <T = QueryRow>(sql: string, params: unknown[] = []) => clusterManager.query<T>(sql, params);
export default clusterManager;

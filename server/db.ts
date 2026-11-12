/**
 * Brain Database Adapter (server/db.ts)
 *
 * Strictly isolates local dev, migrations, backfills, and Brain pipeline runs
 * to Replica 3 (Singapore — adlwwkqgexykuhkdkpfu) by default (`BRAIN_DB_TARGET=replica3`),
 * guaranteeing zero writes touch Primary (Tokyo) until explicitly promoted in Sprint 5.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { Pool, QueryResult, QueryResultRow } from "pg";

function loadEnvMap(): Record<string, string> {
  const out: Record<string, string> = {};
  const roots = [process.cwd(), path.resolve(process.cwd(), "..")];
  for (const root of roots) {
    for (const file of [".env.local", ".env"]) {
      const p = path.join(root, file);
      try {
        const content = fs.readFileSync(p, "utf8");
        for (const line of content.split("\n")) {
          const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
          if (m && !out[m[1]]) {
            out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
          }
        }
      } catch {
        // ignore missing file
      }
    }
  }
  return out;
}

const envMap = loadEnvMap();

export function getEnvVar(key: string, fallback = ""): string {
  return process.env[key] || envMap[key] || fallback;
}

export function resolveBrainDatabaseUrl(): { url: string; target: "replica3" | "primary" } {
  const target = (getEnvVar("BRAIN_DB_TARGET", "replica3") || "replica3").toLowerCase();
  if (target === "primary") {
    const primaryUrl = getEnvVar("DIRECT_URL") || getEnvVar("DATABASE_URL");
    if (!primaryUrl) throw new Error("PRIMARY DATABASE_URL is not configured");
    return { url: primaryUrl, target: "primary" };
  }
  const r3Url = getEnvVar("DIRECT_REPLICA3_URL") || getEnvVar("DATABASE_REPLICA3_URL");
  if (!r3Url) throw new Error("DIRECT_REPLICA3_URL / DATABASE_REPLICA3_URL is not configured");
  return { url: r3Url, target: "replica3" };
}

let _brainPool: Pool | null = null;
let _currentTarget: string | null = null;

export function getBrainPool(): Pool {
  const { url, target } = resolveBrainDatabaseUrl();
  if (_brainPool && _currentTarget === target) return _brainPool;

  const parsed = new URL(url);
  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("pgbouncer");

  _currentTarget = target;
  _brainPool = new Pool({
    connectionString: parsed.toString(),
    ssl: { rejectUnauthorized: false },
    max: 15,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 30_000,
  });

  _brainPool.on("error", (err: any) => {
    console.warn(`[BrainDB:${target}] Pool idle socket closed (handled):`, err?.message);
  });

  return _brainPool;
}

export async function dbQuery<T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await getBrainPool().query(sql, params as any[]);
  return res.rows as T[];
}

export const db = {
  query: <T extends QueryResultRow = any>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> =>
    getBrainPool().query<T>(sql, params as any[]),
};

export async function closeBrainDb(): Promise<void> {
  if (_brainPool) {
    await _brainPool.end().catch(() => {});
    _brainPool = null;
    _currentTarget = null;
  }
}

// Helper for building simple Prisma-style WHERE clauses on a single table
function buildWhereClause(where: Record<string, any> | undefined, startIdx = 1): { clause: string; values: any[] } {
  if (!where || Object.keys(where).length === 0) return { clause: "", values: [] };
  const conds: string[] = [];
  const values: any[] = [];

  const walk = (obj: Record<string, any>): string => {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      if (k === "OR" && Array.isArray(v)) {
        const orParts = v.map(sub => `(${walk(sub)})`).filter(Boolean);
        if (orParts.length > 0) parts.push(`(${orParts.join(" OR ")})`);
        continue;
      }
      if (k === "AND" && Array.isArray(v)) {
        const andParts = v.map(sub => `(${walk(sub)})`).filter(Boolean);
        if (andParts.length > 0) parts.push(`(${andParts.join(" AND ")})`);
        continue;
      }
      if (v === null) {
        parts.push(`"${k}" IS NULL`);
      } else if (typeof v === "object" && !(v instanceof Date) && !Array.isArray(v)) {
        if ("in" in v && Array.isArray(v.in)) {
          values.push(v.in);
          parts.push(`"${k}" = ANY($${startIdx + values.length - 1})`);
        }
        if ("not" in v) {
          if (v.not === null) {
            parts.push(`"${k}" IS NOT NULL`);
          } else {
            values.push(v.not);
            parts.push(`"${k}" <> $${startIdx + values.length - 1}`);
          }
        }
        if ("gte" in v) {
          values.push(v.gte);
          parts.push(`"${k}" >= $${startIdx + values.length - 1}`);
        }
        if ("gt" in v) {
          values.push(v.gt);
          parts.push(`"${k}" > $${startIdx + values.length - 1}`);
        }
        if ("lte" in v) {
          values.push(v.lte);
          parts.push(`"${k}" <= $${startIdx + values.length - 1}`);
        }
        if ("lt" in v) {
          values.push(v.lt);
          parts.push(`"${k}" < $${startIdx + values.length - 1}`);
        }
        if ("has" in v) {
          values.push(v.has);
          parts.push(`$${startIdx + values.length - 1} = ANY("${k}")`);
        }
      } else {
        values.push(v);
        parts.push(`"${k}" = $${startIdx + values.length - 1}`);
      }
    }
    return parts.join(" AND ");
  };

  const built = walk(where);
  return { clause: built ? `WHERE ${built}` : "", values };
}

function buildOrderBy(orderBy: any): string {
  if (!orderBy) return "";
  const list = Array.isArray(orderBy) ? orderBy : [orderBy];
  const parts: string[] = [];
  for (const item of list) {
    for (const [col, dir] of Object.entries(item)) {
      parts.push(`"${col}" ${String(dir).toUpperCase() === "DESC" ? "DESC" : "ASC"}`);
    }
  }
  return parts.length ? `ORDER BY ${parts.join(", ")}` : "";
}

function serializeVal(v: any): any {
  if (v === undefined) return null;
  if (v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v)) {
    return JSON.stringify(v);
  }
  return v;
}

function createModelDelegate(tableName: string, jsonArrayCols: Set<string> = new Set()) {
  const prepVal = (col: string, val: any) => {
    if (val === undefined) return null;
    if (jsonArrayCols.has(col) && Array.isArray(val)) return JSON.stringify(val);
    return serializeVal(val);
  };

  return {
    async findUnique(args: { where: Record<string, any> }) {
      const { clause, values } = buildWhereClause(args.where);
      const rows = await dbQuery(`SELECT * FROM "${tableName}" ${clause} LIMIT 1`, values);
      return rows[0] ?? null;
    },
    async findFirst(args?: { where?: Record<string, any>; orderBy?: any }) {
      const { clause, values } = buildWhereClause(args?.where);
      const order = buildOrderBy(args?.orderBy);
      const rows = await dbQuery(`SELECT * FROM "${tableName}" ${clause} ${order} LIMIT 1`, values);
      return rows[0] ?? null;
    },
    async findMany(args?: { where?: Record<string, any>; orderBy?: any; take?: number; skip?: number }) {
      const { clause, values } = buildWhereClause(args?.where);
      const order = buildOrderBy(args?.orderBy);
      const limit = args?.take ? `LIMIT ${Number(args.take)}` : "";
      const offset = args?.skip ? `OFFSET ${Number(args.skip)}` : "";
      return dbQuery(`SELECT * FROM "${tableName}" ${clause} ${order} ${limit} ${offset}`, values);
    },
    async count(args?: { where?: Record<string, any> }) {
      const { clause, values } = buildWhereClause(args?.where);
      const rows = await dbQuery<{ cnt: number }>(`SELECT COUNT(*)::int AS cnt FROM "${tableName}" ${clause}`, values);
      return rows[0]?.cnt ?? 0;
    },
    async aggregate(args: { where?: Record<string, any>; _sum?: Record<string, boolean> }) {
      const { clause, values } = buildWhereClause(args.where);
      const sumCols = Object.keys(args._sum ?? {});
      const selects = sumCols.map(c => `COALESCE(SUM("${c}"), 0) AS "${c}"`).join(", ");
      const rows = await dbQuery(`SELECT ${selects || "1"} FROM "${tableName}" ${clause}`, values);
      return { _sum: rows[0] ?? {} };
    },
    async create(args: { data: Record<string, any> }) {
      const data = { ...args.data };
      if (!data.id) data.id = `cuid_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const cols = Object.keys(data).filter(k => data[k] !== undefined);
      const vals = cols.map(c => prepVal(c, data[c]));
      const quoted = cols.map(c => `"${c}"`).join(", ");
      const ph = cols.map((_, i) => `$${i + 1}`).join(", ");
      const rows = await dbQuery(`INSERT INTO "${tableName}" (${quoted}) VALUES (${ph}) RETURNING *`, vals);
      return rows[0];
    },
    async update(args: { where: Record<string, any>; data: Record<string, any> }) {
      const dataCols = Object.keys(args.data).filter(k => args.data[k] !== undefined);
      const dataVals = dataCols.map(c => prepVal(c, args.data[c]));
      const setClause = dataCols.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
      const { clause, values } = buildWhereClause(args.where, dataVals.length + 1);
      const rows = await dbQuery(
        `UPDATE "${tableName}" SET ${setClause} ${clause} RETURNING *`,
        [...dataVals, ...values]
      );
      return rows[0];
    },
    async upsert(args: { where: Record<string, any>; create: Record<string, any>; update: Record<string, any> }) {
      const existing = await this.findUnique({ where: args.where });
      if (existing) {
        return this.update({ where: args.where, data: args.update });
      }
      return this.create({ data: args.create });
    },
    async deleteMany(args?: { where?: Record<string, any> }) {
      const { clause, values } = buildWhereClause(args?.where);
      const res = await getBrainPool().query(`DELETE FROM "${tableName}" ${clause}`, values);
      return { count: res.rowCount ?? 0 };
    },
  };
}

function buildTaggedSql(strings: TemplateStringsArray, values: any[]): { sql: string; params: any[] } {
  let sql = "";
  const params: any[] = [];
  strings.forEach((str, i) => {
    sql += str;
    if (i < values.length) {
      params.push(values[i]);
      sql += `$${params.length}`;
    }
  });
  return { sql, params };
}

export const prisma = {
  lead: createModelDelegate("Lead"),
  brand: createModelDelegate("Brand"),
  draftGeneration: createModelDelegate("DraftGeneration", new Set(["followups", "hardViolations", "softViolations", "riskReasons"])),
  providerUsage: createModelDelegate("ProviderUsage"),
  proofPoint: createModelDelegate("ProofPoint"),
  playbook: createModelDelegate("Playbook"),
  knowledgeChunk: createModelDelegate("KnowledgeChunk"),
  brandResearch: createModelDelegate("BrandResearch", new Set(["signals"])),
  systemControl: createModelDelegate("SystemControl"),
  evalCase: createModelDelegate("EvalCase"),
  changeProposal: createModelDelegate("ChangeProposal"),
  promptVersion: createModelDelegate("PromptVersion"),
  systemSetting: createModelDelegate("SystemSetting"),
  suppressedEmail: createModelDelegate("SuppressedEmail"),
  emailEvent: createModelDelegate("EmailEvent"),
  emailMessage: createModelDelegate("EmailMessage"),
  mailbox: createModelDelegate("Mailbox"),
  campaign: createModelDelegate("Campaign"),
  notification: createModelDelegate("Notification"),
  user: createModelDelegate("User"),

  async $queryRaw<T = any>(strings: TemplateStringsArray | string, ...values: any[]): Promise<T> {
    if (typeof strings === "string") {
      return (await dbQuery(strings, values)) as unknown as T;
    }
    const { sql, params } = buildTaggedSql(strings, values);
    return (await dbQuery(sql, params)) as unknown as T;
  },

  async $executeRaw(strings: TemplateStringsArray | string, ...values: any[]): Promise<number> {
    if (typeof strings === "string") {
      const res = await getBrainPool().query(strings, values);
      return res.rowCount ?? 0;
    }
    const { sql, params } = buildTaggedSql(strings, values);
    const res = await getBrainPool().query(sql, params);
    return res.rowCount ?? 0;
  },

  async $transaction<T>(ops: Promise<any>[] | ((tx: typeof prisma) => Promise<T>)): Promise<T> {
    if (typeof ops === "function") {
      return ops(prisma);
    }
    return (await Promise.all(ops)) as unknown as T;
  },
};

export default prisma;


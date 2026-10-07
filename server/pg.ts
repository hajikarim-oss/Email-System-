import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import type { QueryFn } from "./types";

const currentDir = typeof __dirname !== "undefined"
    ? __dirname
    : process.cwd();

let pool: Pool | null = null;

function readEnvFile(file: string): string | null {
    try {
        const content = fs.readFileSync(file, "utf8");
        const match = content.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/m);
        if (!match) return null;
        return match[1].trim().replace(/^["']|["']$/g, "") || null;
    } catch {
        return null;
    }
}

export function resolveDatabaseUrl(): string | null {
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

    const roots = [
        process.cwd(),
        path.resolve(process.cwd(), ".."),
        path.resolve(process.cwd(), "web"),
        path.resolve(process.cwd(), "nexus-outbound"),
        path.resolve(currentDir, ".."),
        path.resolve(currentDir, "../web"),
        path.resolve(currentDir, "../nexus-outbound"),
    ];
    for (const root of roots) {
        for (const file of [".env.local", ".env"]) {
            const value = readEnvFile(path.join(root, file));
            if (value) return value;
        }
    }
    return null;
}

export class DatabaseUnavailableError extends Error {
    constructor(message = "DATABASE_URL is not configured") {
        super(message);
        this.name = "DatabaseUnavailableError";
    }
}

export function getPool(): Pool {
    if (pool) return pool;

    const url = resolveDatabaseUrl();
    if (!url) throw new DatabaseUnavailableError();

    // The Supabase pooler terminates TLS with a certificate Node does not trust
    // out of the box, and pg >= 8.23 treats sslmode=require as verify-full.
    // Honour an explicit sslmode=require by skipping chain verification, which
    // is the documented setup for this pooler.
    const parsed = new URL(url);
    const sslmode = parsed.searchParams.get("sslmode");
    const useSsl = Boolean(sslmode) && sslmode !== "disable";
    if (useSsl) parsed.searchParams.delete("sslmode");

    pool = new Pool({
        connectionString: parsed.toString(),
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 10_000,
    });

    // Supabase transaction pooler resets idle TLS sockets periodically (ECONNRESET).
    // An error listener is mandatory so pg does not crash the Node process on idle disconnects.
    (pool as any).on?.("error", (err: any) => {
        console.warn("[pgPool] Idle client connection closed by pooler (handled safely):", err?.message);
    });

    return pool;
}

export const pgQuery: QueryFn = async <T = Record<string, any>>(sql: string, params: unknown[] = []) => {
    let attempts = 0;
    while (attempts < 2) {
        attempts++;
        try {
            const client = await getPool().connect();
            try {
                const result = await client.query(sql, params as any[]);
                return result.rows as unknown as T[];
            } finally {
                client.release();
            }
        } catch (err: any) {
            const isTransient = err.code === "ECONNRESET" || err.message?.includes("Connection terminated") || err.message?.includes("closed");
            if (isTransient && attempts < 2) {
                console.warn("[pgQuery] Transient connection drop, retrying query once...");
                await new Promise((r) => setTimeout(r, 250));
                continue;
            }
            throw err;
        }
    }
    return [] as unknown as T[];
};


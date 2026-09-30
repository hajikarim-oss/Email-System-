import type { ServerResponse } from "http";

// `cacheSeconds` lets the Vercel edge hold a successful read for that long
// (`stale-while-revalidate` keeps serving it while a fresh copy is fetched).
// Errors are always sent with `no-store` so a 503 can never be cached.
export function send(res: ServerResponse, status: number, body: unknown, cacheSeconds = 0) {
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": cacheSeconds
            ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 6}`
            : "no-store",
    });
    res.end(JSON.stringify(body));
}

// Warm-lambda memo: a function instance survives between invocations, so a
// short TTL here turns a repeat call into ~0 ms instead of a warehouse
// round-trip (the report used to take 1.4 s warm, 9 s cold).
export class Memo<T> {
    private entries = new Map<string, { at: number; body: T }>();

    constructor(private ttlMs: number, private maxEntries = 8) { }

    get(key: string): T | undefined {
        const hit = this.entries.get(key);
        if (!hit) return undefined;
        if (Date.now() - hit.at >= this.ttlMs) {
            this.entries.delete(key);
            return undefined;
        }
        return hit.body;
    }

    set(key: string, body: T): void {
        if (this.entries.size >= this.maxEntries && !this.entries.has(key)) {
            const oldest = this.entries.keys().next().value;
            if (oldest !== undefined) this.entries.delete(oldest);
        }
        this.entries.set(key, { at: Date.now(), body });
    }
}

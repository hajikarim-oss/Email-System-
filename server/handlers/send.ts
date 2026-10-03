import type { IncomingMessage, ServerResponse } from "http";

// `cacheSeconds` keeps a successful read fresh in the CALLER'S BROWSER for
// that long. Responses are user-scoped (each session sees only its own data),
// so they are marked `private`: a shared CDN cache must never replay one
// member's dashboard to another. Server-side warmth comes from Memo instead.
// Errors are always sent with `no-store` so a 503 can never be cached.
export function send(res: ServerResponse, status: number, body: unknown, cacheSeconds = 0) {
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": cacheSeconds ? `private, max-age=${cacheSeconds}` : "no-store",
    });
    res.end(JSON.stringify(body));
}

// Small JSON body reader for POST/PATCH handlers (100 KB cap).
export function readJsonBody<T = Record<string, unknown>>(req: IncomingMessage, limitBytes = 100_000): Promise<T> {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > limitBytes) {
                reject(new Error("payload_too_large"));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            if (!raw.trim()) {
                resolve({} as T);
                return;
            }
            try {
                resolve(JSON.parse(raw) as T);
            } catch {
                reject(new Error("invalid_json"));
            }
        });
        req.on("error", reject);
    });
}

// Warm-lambda memo: a function instance survives between invocations, so a
// short TTL here turns a repeat call into ~0 ms instead of a warehouse
// round-trip (the report used to take 1.4 s warm, 9 s cold).
export class Memo<T> {
    private entries = new Map<string, { at: number; body: T }>();
    private ttlMs: number;
    private maxEntries: number;

    constructor(ttlMs: number, maxEntries = 8) {
        this.ttlMs = ttlMs;
        this.maxEntries = maxEntries;
    }

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

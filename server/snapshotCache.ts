import fs from "node:fs";
import path from "node:path";

const CACHE_DIR = path.resolve(process.cwd(), ".cache");
const SNAPSHOT_FILE = path.join(CACHE_DIR, "telemetry-snapshot.json");

type SnapshotBucket = "dashboard" | "report" | "campaigns" | "campaignStats" | "mailboxes" | "contactsCounts";

interface SnapshotStore {
    dashboard: Record<string, { at: number; data: any }>;
    report: Record<string, { at: number; data: any }>;
    campaigns: Record<string, { at: number; data: any }>;
    campaignStats: Record<string, { at: number; data: any }>;
    mailboxes: Record<string, { at: number; data: any }>;
    contactsCounts: Record<string, { at: number; data: any }>;
}

let store: SnapshotStore | null = null;
let flushTimer: NodeJS.Timeout | null = null;

function ensureStore(): SnapshotStore {
    if (store) return store;
    store = {
        dashboard: {},
        report: {},
        campaigns: {},
        campaignStats: {},
        mailboxes: {},
        contactsCounts: {},
    };
    try {
        if (fs.existsSync(SNAPSHOT_FILE)) {
            const raw = fs.readFileSync(SNAPSHOT_FILE, "utf8");
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") {
                store = {
                    dashboard: parsed.dashboard || {},
                    report: parsed.report || {},
                    campaigns: parsed.campaigns || {},
                    campaignStats: parsed.campaignStats || {},
                    mailboxes: parsed.mailboxes || {},
                    contactsCounts: parsed.contactsCounts || {},
                };
            }
        }
    } catch {
        // Ignore corrupt cache file
    }
    return store;
}

function scheduleFlush(): void {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        if (!store) return;
        try {
            if (!fs.existsSync(CACHE_DIR)) {
                fs.mkdirSync(CACHE_DIR, { recursive: true });
            }
            const tmp = `${SNAPSHOT_FILE}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify(store), "utf8");
            fs.renameSync(tmp, SNAPSHOT_FILE);
        } catch {
            // Non-fatal
        }
    }, 1_500);
    if (typeof (flushTimer as any)?.unref === "function") {
        (flushTimer as any).unref();
    }
}

export function readSnapshot<T>(bucket: SnapshotBucket, key: string): { at: number; data: T } | null {
    const s = ensureStore();
    const entry = s[bucket]?.[key];
    if (!entry || entry.data === undefined || entry.data === null) return null;
    return entry as { at: number; data: T };
}

export function writeSnapshot<T>(bucket: SnapshotBucket, key: string, data: T): void {
    const s = ensureStore();
    if (!s[bucket]) s[bucket] = {};
    s[bucket][key] = { at: Date.now(), data };
    scheduleFlush();
}

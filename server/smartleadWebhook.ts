// Smartlead live events used to be logged and dropped: the webhook receiver
// answered 200 and the open/reply/bounce never reached the analytics tables.
// This is the shared persistence path for both the Vercel receiver and the
// vite dev mirror:
//
//   1. bounce/unsubscribe addresses are suppressed immediately — even when no
//      Lead row matches — so a burnt address stops being mailed at volume;
//   2. the event is written to EmailEvent (idempotent: providerEventId is
//      unique and Smartlead retries deliveries, so a retry collides instead
//      of double-counting analytics);
//   3. only for a freshly inserted event, the Lead row is advanced (status,
//      counters, timestamps) — the same side effects nexus-outbound's
//      receiver performs, via plain SQL so both runtimes share one code path.
//
// Errors propagate: callers answer 503 so Smartlead retries instead of the
// event being lost. "no_lead" / "unsupported" mean respond 200, a retry
// cannot help.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pgQuery } from "./pg";

export type SmartleadEventOutcome =
    // Row written (or already there on a retry).
    | "persisted"
    // No Lead matches the recipient address; retrying cannot help.
    | "no_lead"
    // Not a lead-level event we model (e.g. CAMPAIGN_STATUS_CHANGED).
    | "unsupported";

const EVENT_MAP: Record<string, string> = {
    EMAIL_SENT: "sent",
    FIRST_EMAIL_SENT: "sent",
    EMAIL_DELIVERED: "sent",
    EMAIL_OPEN: "opened",
    EMAIL_OPENED: "opened",
    EMAIL_LINK_CLICK: "clicked",
    EMAIL_CLICKED: "clicked",
    EMAIL_REPLY: "replied",
    EMAIL_REPLIED: "replied",
    EMAIL_BOUNCE: "bounced",
    EMAIL_BOUNCED: "bounced",
    LEAD_UNSUBSCRIBED: "unsubscribed",
};

/** Smartlead's event spellings -> the EmailEvent.eventType vocabulary. */
export function mapSmartleadEventType(raw: unknown): string | null {
    const key = String(raw || "").trim().toUpperCase();
    return EVENT_MAP[key] ?? null;
}

function deriveProviderEventId(payload: Record<string, any>, eventType: string, email: string): string {
    const explicit = payload.event_id || payload.id || payload.message_id || payload.webhook_id;
    if (explicit) return String(explicit);
    const ts = payload.timestamp ?? payload.created_at ?? payload.sent_at ?? "";
    return `sl:${eventType}:${email}:${payload.email_campaign_id || payload.campaign_id || ""}:${ts}`;
}

/** HMAC-SHA256 over the raw body, hex digest — same scheme as nexus-outbound's receiver. */
export function verifySmartleadSignature(body: string, signature: string, secret: string): boolean {
    const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
    const bufA = Buffer.from(expected);
    const bufB = Buffer.from(signature);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

/** SMARTLEAD_WEBHOOK_SECRET from process.env, else the local .env files. */
export function resolveWebhookSecret(): string {
    const fromProcess = process.env.SMARTLEAD_WEBHOOK_SECRET?.trim();
    if (fromProcess) return fromProcess;
    const roots = [process.cwd(), path.resolve(process.cwd(), "..")];
    for (const root of roots) {
        for (const file of [".env.local", ".env"]) {
            try {
                const content = fs.readFileSync(path.join(root, file), "utf8");
                const match = content.match(/^\s*SMARTLEAD_WEBHOOK_SECRET\s*=\s*(.+)\s*$/m);
                if (match) {
                    const value = match[1].trim().replace(/^["']|["']$/g, "");
                    if (value) return value;
                }
            } catch {
                // no env file here
            }
        }
    }
    return "";
}

function isHardBounce(payload: Record<string, any>): boolean {
    return String(payload.bounce_type || payload.bounce_category || "hard").toLowerCase().includes("hard");
}

async function suppressEmail(email: string, reason: "HARD_BOUNCE" | "UNSUBSCRIBED"): Promise<void> {
    await pgQuery(
        `INSERT INTO "SuppressedEmail" ("id", "email", "reason", "source")
         VALUES (gen_random_uuid()::text, $1, $2, 'smartlead_webhook')
         ON CONFLICT ("email") DO UPDATE SET "reason" = EXCLUDED."reason"`,
        [email, reason],
    );
}

async function advanceLead(
    lead: { id: string; bounceCount: number },
    eventType: string,
    payload: Record<string, any>,
    email: string,
    now: string,
): Promise<void> {
    switch (eventType) {
        case "sent": {
            const stepRaw = payload.step ?? payload.sequence_number ?? payload.email_sequence_number;
            const step = Number.parseInt(String(stepRaw), 10);
            const stepTerm = Number.isNaN(step) ? "" : `, "lastStepSent" = GREATEST("lastStepSent", ${step})`;
            await pgQuery(
                `UPDATE "Lead" SET "totalMessages" = "totalMessages" + 1, "totalOutbound" = "totalOutbound" + 1,
                        "firstContactedAt" = COALESCE("firstContactedAt", $2::timestamptz),
                        "lastContactedAt" = $2::timestamptz, "updatedAt" = $2::timestamptz${stepTerm}
                 WHERE id = $1`,
                [lead.id, now],
            );
            return;
        }
        case "opened":
            await pgQuery(
                `UPDATE "Lead" SET "openCount" = "openCount" + 1,
                        "firstOpenAt" = COALESCE("firstOpenAt", $2::timestamptz),
                        "lastOpenAt" = $2::timestamptz,
                        "leadCategory" = CASE WHEN "leadCategory" IN ('UNCATEGORIZED', 'NOT_WORKING') THEN 'POTENTIAL' ELSE "leadCategory" END,
                        "updatedAt" = $2::timestamptz
                 WHERE id = $1`,
                [lead.id, now],
            );
            return;
        case "clicked":
            await pgQuery(
                `UPDATE "Lead" SET "clickCount" = "clickCount" + 1,
                        "leadCategory" = CASE WHEN "leadCategory" IN ('UNCATEGORIZED', 'NOT_WORKING') THEN 'POTENTIAL' ELSE "leadCategory" END,
                        "updatedAt" = $2::timestamptz
                 WHERE id = $1`,
                [lead.id, now],
            );
            return;
        case "replied":
            await pgQuery(
                `UPDATE "Lead" SET "status" = 'REPLIED', "repliedAt" = $2::timestamptz,
                        "lastRepliedAt" = $2::timestamptz, "totalReplied" = "totalReplied" + 1,
                        "totalInbound" = "totalInbound" + 1, "leadCategory" = 'WORKING',
                        "updatedAt" = $2::timestamptz
                 WHERE id = $1`,
                [lead.id, now],
            );
            return;
        case "bounced": {
            const newCount = lead.bounceCount + 1;
            const hard = isHardBounce(payload) || newCount >= 3;
            await pgQuery(
                `UPDATE "Lead" SET "bounceCount" = $2, "bounceType" = $3,
                        "lastBouncedAt" = $4::timestamptz, "totalBounced" = "totalBounced" + 1,
                        ${hard ? `"status" = 'BOUNCED',` : ""} "updatedAt" = $4::timestamptz
                 WHERE id = $1`,
                [lead.id, newCount, hard ? "hard" : "soft", now],
            );
            return;
        }
        case "unsubscribed":
            await pgQuery(
                `UPDATE "Lead" SET "status" = 'UNSUBSCRIBED', "unsubscribedAt" = $2::timestamptz,
                        "updatedAt" = $2::timestamptz
                 WHERE id = $1`,
                [lead.id, now],
            );
            return;
        default:
            void email;
    }
}

// Concurrency limiter for high-volume webhook ingestion (5,000–10,000 events/day)
// Ensures webhook bursts never exhaust the database connection pool.
const MAX_CONCURRENT_WRITES = 5;
let activeWrites = 0;
const writeQueue: (() => void)[] = [];

function acquireWriteLock(): Promise<void> {
    if (activeWrites < MAX_CONCURRENT_WRITES) {
        activeWrites++;
        return Promise.resolve();
    }
    return new Promise((resolve) => writeQueue.push(resolve));
}

function releaseWriteLock(): void {
    activeWrites--;
    if (writeQueue.length > 0) {
        activeWrites++;
        const next = writeQueue.shift();
        next?.();
    }
}

/**
 * Record one Smartlead webhook delivery. Throws on database failure so the
 * caller can answer 503 and let Smartlead retry (safe: everything is
 * idempotent).
 */
export async function recordSmartleadEvent(payload: Record<string, any>): Promise<SmartleadEventOutcome> {
    const eventType = mapSmartleadEventType(payload.event_type || payload.type);
    if (!eventType) return "unsupported";

    const email = String(payload.email || payload.lead_email || payload.to_email || "").toLowerCase().trim();
    if (!email) return "unsupported";

    const now = new Date().toISOString();

    await acquireWriteLock();
    try {
        // Protect the sending pool first: hard bounces and unsubscribes leave the
        // address pool even when no Lead row exists for the recipient.
        if (eventType === "unsubscribed") {
            await suppressEmail(email, "UNSUBSCRIBED");
        } else if (eventType === "bounced" && isHardBounce(payload)) {
            await suppressEmail(email, "HARD_BOUNCE");
        }

        const providerLeadId = payload.lead_id || payload.provider_lead_id;
        let lead: { id: string; bounceCount: number } | undefined;
        if (providerLeadId) {
            const byProvider = await pgQuery<{ id: string; bounceCount: number }>(
                `SELECT id, "bounceCount" FROM "Lead" WHERE "providerLeadId" = $1 LIMIT 1`,
                [String(providerLeadId)],
            );
            lead = byProvider[0];
        }
        if (!lead) {
            const byEmail = await pgQuery<{ id: string; bounceCount: number }>(
                `SELECT id, "bounceCount" FROM "Lead" WHERE lower("email") = $1 ORDER BY "createdAt" DESC LIMIT 1`,
                [email],
            );
            lead = byEmail[0];
        }
        if (!lead) return "no_lead";

        const fromEmail = String(payload.from_email || payload.sender_email || payload.from || "").toLowerCase().trim() || null;
        const providerEventId = deriveProviderEventId(payload, eventType, email);

        const inserted = await pgQuery<{ id: string }>(
            `INSERT INTO "EmailEvent" ("id", "leadId", "eventType", "providerEventId", "fromEmail", "rawPayload")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5::json)
             ON CONFLICT ("providerEventId") DO NOTHING
             RETURNING id`,
            [lead.id, eventType, providerEventId, fromEmail, JSON.stringify(payload)],
        );
        // Duplicate delivery: the lead was already advanced by the first one.
        if (inserted.length === 0) return "persisted";

        await advanceLead(lead, eventType, payload, email, now);
        return "persisted";
    } finally {
        releaseWriteLock();
    }
}

import type { IncomingMessage, ServerResponse } from "http";
import {
    recordSmartleadEvent,
    resolveWebhookSecret,
    verifySmartleadSignature,
} from "../../server/smartleadWebhook";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-webhook-signature, x-smartlead-signature");

    if (req.method === "OPTIONS") {
        res.statusCode = 200;
        res.end();
        return;
    }

    if (req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            status: "active",
            endpoint: "https://email-system-omega.vercel.app/api/webhooks/smartlead",
            supported_events: [
                "EMAIL_OPEN",
                "EMAIL_SENT",
                "EMAIL_REPLY",
                "EMAIL_BOUNCE",
                "EMAIL_LINK_CLICK",
                "FIRST_EMAIL_SENT",
                "LEAD_UNSUBSCRIBED",
                "CAMPAIGN_STATUS_CHANGED"
            ],
            timestamp: new Date().toISOString()
        }));
        return;
    }

    if (req.method !== "POST") {
        res.statusCode = 405;
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
    }

    let body = "";
    req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
    });

    req.on("end", async () => {
        try {
            // HMAC check mirrors nexus-outbound's receiver: verified only
            // when a secret is configured AND Smartlead sent a signature.
            const secret = resolveWebhookSecret();
            const provided = String(req.headers["x-webhook-signature"] || req.headers["x-smartlead-signature"] || "");
            if (secret && provided && !verifySmartleadSignature(body, provided, secret)) {
                res.writeHead(401, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "invalid_signature" }));
                return;
            }

            const payload = JSON.parse(body || "{}");
            const eventType = payload.event_type || payload.type || "unknown";
            const email = (payload.email || payload.lead_email || payload.to_email || "").toLowerCase();
            const campaignId = payload.email_campaign_id || payload.campaign_id;
            const fromEmail = (payload.from_email || payload.sender_email || payload.from || "").toLowerCase();
            const bccEmail = (payload.bcc || payload.bcc_email || "").toLowerCase();

            // Smart Filter: Discard internal team opens or BCC opens
            const isInternalTeam =
                email.endsWith("@theboredmonkey.com") ||
                email.includes("monu") ||
                email.includes("haji.karim") ||
                email.includes("vatsal.vadecha") ||
                email.includes("snehal.maurya") ||
                email.includes("preeti.karki");

            const isBccOrSender =
                (fromEmail && email === fromEmail) ||
                (bccEmail && email === bccEmail);

            if ((eventType === "EMAIL_OPEN" || eventType === "EMAIL_OPENED") && (isInternalTeam || isBccOrSender)) {
                console.log(`[SmartFilter] Ignored non-client/BCC open event for ${email}`);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    received: true,
                    ignored: true,
                    reason: "non_client_or_bcc_open",
                    email,
                    timestamp: new Date().toISOString()
                }));
                return;
            }

            console.log(`[Smartlead Webhook] ${eventType} for ${email} (Campaign: ${campaignId}, Sender: ${fromEmail})`);

            // Persist the event so opens/replies/bounces land in the
            // analytics tables. Database trouble answers 503: Smartlead
            // retries, and persistence is idempotent on providerEventId.
            let outcome = "unsupported";
            try {
                outcome = await recordSmartleadEvent(payload);
            } catch (err: any) {
                console.error("[Smartlead Webhook] Persistence failed:", err?.message || err);
                res.writeHead(503, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ received: false, error: "persistence_failed", retry: true }));
                return;
            }
            if (outcome === "no_lead") {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    received: true,
                    ignored: true,
                    reason: "lead_not_found",
                    event_type: eventType,
                    email,
                    timestamp: new Date().toISOString(),
                }));
                return;
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                received: true,
                event_type: eventType,
                email,
                campaign_id: campaignId,
                persisted: outcome === "persisted",
                timestamp: new Date().toISOString(),
            }));
        } catch (err: any) {
            console.error("[Smartlead Webhook Error]", err);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ received: true, note: "raw_received" }));
        }
    });
}

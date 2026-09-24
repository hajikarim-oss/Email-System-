import type { IncomingMessage, ServerResponse } from "http";

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
            const payload = JSON.parse(body || "{}");
            const eventType = payload.event_type || payload.type || "unknown";
            const email = (payload.email || payload.lead_email || payload.to_email || "").toLowerCase();
            const campaignId = payload.email_campaign_id || payload.campaign_id;
            const fromEmail = (payload.from_email || payload.sender_email || payload.from || "").toLowerCase();
            const bccEmail = (payload.bcc || payload.bcc_email || "").toLowerCase();

            // Smart Filter: Discard internal team opens or BCC opens
            const isInternalTeam =
                email.endsWith("@theboredmonkey.com") ||
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

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                received: true,
                event_type: eventType,
                email,
                campaign_id: campaignId,
                timestamp: new Date().toISOString()
            }));
        } catch (err: any) {
            console.error("[Smartlead Webhook Error]", err);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ received: true, note: "raw_received" }));
        }
    });
}

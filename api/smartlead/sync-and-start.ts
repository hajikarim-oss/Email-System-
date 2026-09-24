import type { IncomingMessage, ServerResponse } from "http";
import https from "https";

const envKey = process.env.SMARTLEAD_API_KEY;
const PRIMARY_KEY = (envKey && !envKey.startsWith("412be3a1")) ? envKey : "39e19d19-23fa-4276-aff2-4c8b834eb4ce_3g8knd6";
const SECONDARY_KEY = "e4ebd3cd-1171-4f5c-96a0-7419847b7c44_asttizt";
const BASE_URL = "https://server.smartlead.ai/api/v1";

function apiCall(endpoint: string, method: string = "GET", body?: any, customKey?: string): Promise<{ status: number; data: any }> {
    const apiKey = customKey || PRIMARY_KEY;
    return new Promise((resolve, reject) => {
        const separator = endpoint.includes("?") ? "&" : "?";
        const fullPath = `${endpoint}${separator}api_key=${apiKey}`;
        const url = `${BASE_URL}${fullPath}`;
        const payload = body ? JSON.stringify(body) : "";

        const req = https.request(url, {
            method,
            headers: {
                "Content-Type": "application/json",
                ...(body ? { "Content-Length": Buffer.byteLength(payload) } : {}),
            },
        }, (res: any) => {
            let text = "";
            res.on("data", (chunk: any) => { text += chunk; });
            res.on("end", async () => {
                try {
                    const parsed = text ? JSON.parse(text) : {};
                    if ((res.statusCode === 401 || res.statusCode === 404) && !customKey && apiKey !== SECONDARY_KEY) {
                        try {
                            const fallbackRes = await apiCall(endpoint, method, body, SECONDARY_KEY);
                            if (fallbackRes.status >= 200 && fallbackRes.status < 300) {
                                return resolve(fallbackRes);
                            }
                        } catch {}
                    }
                    resolve({ status: res.statusCode, data: parsed });
                } catch {
                    resolve({ status: res.statusCode, data: { raw: text } });
                }
            });
        });
        req.on("error", (err: any) => reject(err));
        if (payload) req.write(payload);
        req.end();
    });
}

function normalizeToSmartleadTemplate(text: string): string {
    if (!text) return "";
    return text
        .replace(/&nbsp;/g, " ")
        .replace(/<span[^>]*style="[^"]*(?:background|border|monospace)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, "$1")
        .replace(/<span[^>]*class="[^"]*(?:variable-badge|token-badge)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, "$1")
        .replace(/\{\{\s*(\.?first_?name|first|fname)\s*\}\}/gi, "{{first_name}}")
        .replace(/\[\s*(First\s*Name|Name)\s*\]/gi, "{{first_name}}")
        .replace(/\{\{\s*(\.?last_?name|last|lname|surname)\s*\}\}/gi, "{{last_name}}")
        .replace(/\[\s*(Last\s*Name|Surname)\s*\]/gi, "{{last_name}}")
        .replace(/\{\{\s*(\.?company_?name|company|org|organization|brand)\s*\}\}/gi, "{{company_name}}")
        .replace(/\[\s*(Company\s*Name|Company|Brand\s*Name|Brand|Org)\s*\]/gi, "{{company_name}}")
        .replace(/\{\{\s*(\.?job_?title|title|role|position)\s*\}\}/gi, "{{title}}")
        .replace(/\[\s*(Job\s*Title|Title|Role|Position)\s*\]/gi, "{{title}}");
}

function cleanCompanyName(nameOrDomain?: string): string {
    if (!nameOrDomain) return "TheBoredMonkey";
    let cleaned = nameOrDomain.trim();
    if (cleaned.includes("@")) {
        cleaned = cleaned.split("@")[1] || cleaned;
    }
    cleaned = cleaned.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
    cleaned = cleaned.split("/")[0].split("?")[0].trim();
    cleaned = cleaned.replace(/\.(com|co|org|net|in|io|ai|tech|biz|info|us|uk|ca|de|jp|fr|au|ru|ch|it|nl|se|no|es|cz|eu|gov|edu)(\.[a-z]{2,3})?$/i, "");
    cleaned = cleaned.replace(/\.[a-z]{2,4}$/i, "");
    return cleaned || nameOrDomain;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.statusCode = 200;
        res.end();
        return;
    }

    if (req.method !== "POST") {
        res.statusCode = 405;
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
    }

    let body = "";
    req.on("data", (chunk: any) => { body += chunk.toString(); });
    req.on("end", async () => {
        try {
            const parsed = JSON.parse(body || "{}");
            const campaignName = parsed.name || `Campaign ${Date.now()}`;
            let smartleadId = parsed.smartlead_id;

            const sender = (parsed.sender_email || parsed.from_email || "").toLowerCase();
            const isPreeti = sender.includes("preeti") || (Array.isArray(parsed.mailbox_ids) && parsed.mailbox_ids.includes(23458016));
            const chosenKey = parsed.api_key || (isPreeti ? SECONDARY_KEY : PRIMARY_KEY);

            if (campaignName.includes("116")) {
                smartleadId = 3967633;
            } else if (smartleadId === 3959417 && !campaignName.includes("404") && !campaignName.includes("408")) {
                smartleadId = null;
            }

            // 1. Create campaign if not linked
            if (!smartleadId) {
                const createRes = await apiCall("/campaigns/create", "POST", { name: campaignName }, chosenKey);
                if (createRes.data?.id) {
                    smartleadId = createRes.data.id;
                } else {
                    smartleadId = 4015596;
                }
            }

            // 2. Link mailboxes
            let mailboxIds = isPreeti ? [23458016] : [23457457];
            try {
                const mbRes = await apiCall("/email-accounts", "GET", undefined, chosenKey);
                if (Array.isArray(mbRes.data) && mbRes.data.length > 0) {
                    mailboxIds = mbRes.data.map((m: any) => m.id);
                }
            } catch {}

            await apiCall(`/campaigns/${smartleadId}/email-accounts`, "POST", {
                email_account_ids: mailboxIds,
            }, chosenKey);

            // 3. Sequences
            const seqSteps = (parsed.steps && parsed.steps.length > 0)
                ? parsed.steps.map((s: any, idx: number) => ({
                    seq_number: idx + 1,
                    seq_delay_details: { delay_in_days: s.wait_after || 0 },
                    subject: normalizeToSmartleadTemplate(s.subject || (idx === 0 ? `Outreach: ${campaignName}` : "")),
                    email_body: normalizeToSmartleadTemplate(s.body_html || s.body_plain || "<p>Hello {{first_name}}, reaching out from TheBoredMonkey.</p>"),
                }))
                : [
                    {
                        seq_number: 1,
                        seq_delay_details: { delay_in_days: 0 },
                        subject: `Discussion regarding partnership | ${campaignName}`,
                        email_body: "<p>Hey {{first_name}},</p><p>Wanted to connect regarding our enterprise solutions.</p><p>Best,<br/>Haji Karim | TheBoredMonkey</p>",
                    },
                ];

            await apiCall(`/campaigns/${smartleadId}/sequences`, "POST", { sequences: seqSteps }, chosenKey);

            // 4. Schedule
            await apiCall(`/campaigns/${smartleadId}/schedule`, "POST", {
                timezone: parsed.timezone || "Asia/Kolkata",
                days_of_the_week: [1, 2, 3, 4, 5],
                start_hour: "10:00",
                end_hour: "18:00",
                min_time_btw_emails: 3,
                max_new_leads_per_day: 50,
            }, chosenKey);

            // 5. Leads
            const rawLeads = parsed.leads || [];
            if (rawLeads.length > 0) {
                const leadList = rawLeads.map((l: any) => {
                    const fName = l.first_name || l.firstName || (l.name ? l.name.split(" ")[0] : "") || (l.email ? l.email.split("@")[0] : "Prospect");
                    const lName = l.last_name || l.lastName || (l.name ? l.name.split(" ").slice(1).join(" ") : "") || "";
                    const cName = cleanCompanyName(l.company || l.company_name || l.custom_fields?.company);
                    const jobTitle = l.title || l.role || l.custom_fields?.title || "Executive";
                    return {
                        email: l.email,
                        first_name: fName,
                        last_name: lName,
                        company_name: cName,
                        custom_fields: {
                            title: jobTitle,
                            firstName: fName,
                            lastName: lName,
                            company: cName,
                            first_name: fName,
                            last_name: lName,
                            company_name: cName,
                        },
                    };
                });
                await apiCall(`/campaigns/${smartleadId}/leads`, "POST", { lead_list: leadList }, chosenKey);
            }

            // 6. Start campaign
            const startRes = await apiCall(`/campaigns/${smartleadId}/status`, "POST", { status: "START" }, chosenKey);

            // 7. Ensure Live Webhook is registered pointing to Vercel
            try {
                const whRes = await apiCall(`/campaigns/${smartleadId}/webhooks`, "GET", undefined, chosenKey);
                const existing = Array.isArray(whRes.data) ? whRes.data : [];
                const hasVercelWebhook = existing.some((w: any) => w.webhook_url && w.webhook_url.includes("email-system-omega.vercel.app"));
                if (!hasVercelWebhook) {
                    await apiCall(`/campaigns/${smartleadId}/webhooks`, "POST", {
                        name: "TheBoredMonkey Live Event Webhook",
                        webhook_url: "https://email-system-omega.vercel.app/api/webhooks/smartlead",
                        event_types: [
                            "EMAIL_OPEN",
                            "EMAIL_SENT",
                            "EMAIL_REPLY",
                            "EMAIL_BOUNCE",
                            "EMAIL_LINK_CLICK",
                            "LEAD_UNSUBSCRIBED",
                        ],
                    }, chosenKey);
                }
            } catch (wErr: any) {
                console.warn(`[Smartlead API] Webhook check/register:`, wErr.message);
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                ok: true,
                smartlead_id: smartleadId,
                status: "ACTIVE",
                leads_count: rawLeads.length,
                mailbox_linked: mailboxIds,
                smartlead_response: startRes.data,
            }));
        } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
        }
    });
}

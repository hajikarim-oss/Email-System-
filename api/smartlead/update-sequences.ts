import type { IncomingMessage, ServerResponse } from "http";
import https from "https";
import { smartleadPrimary, smartleadSecondary } from "../../server/smartleadKeys";

const PRIMARY_KEY = smartleadPrimary();
const SECONDARY_KEY = smartleadSecondary();

function postSequences(smartleadId: string, postData: string, apiKey: string): Promise<{ statusCode: number; data: string }> {
    if (!apiKey) {
        return Promise.resolve({ statusCode: 503, data: JSON.stringify({ error: "smartlead_api_key_not_configured" }) });
    }
    return new Promise((resolve, reject) => {
        const slReq = https.request({
            hostname: "server.smartlead.ai",
            path: `/api/v1/campaigns/${smartleadId}/sequences?api_key=${apiKey}`,
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(postData)
            }
        }, (slRes) => {
            let data = "";
            slRes.on("data", (chunk) => { data += chunk; });
            slRes.on("end", () => {
                resolve({ statusCode: slRes.statusCode || 200, data });
            });
        });
        slReq.on("error", (err) => reject(err));
        slReq.write(postData);
        slReq.end();
    });
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
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", async () => {
        try {
            const parsed = JSON.parse(body || "{}");
            const smartleadId = parsed.smartlead_id;
            const steps = parsed.steps || [];

            if (!smartleadId) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Missing smartlead_id" }));
                return;
            }

            const sequences = steps.map((s: any, idx: number) => {
                const subject = (s.subject || "")
                    .replace(/\{\{firstName\}\}/g, "{{first_name}}")
                    .replace(/\{\{lastName\}\}/g, "{{last_name}}")
                    .replace(/\{\{CompanyName\}\}/g, "{{company}}")
                    .replace(/\{\{JobTitle\}\}/g, "{{title}}");

                const rawBody = s.body_html || s.body_plain || "";
                const email_body = rawBody
                    .replace(/\{\{firstName\}\}/g, "{{first_name}}")
                    .replace(/\{\{lastName\}\}/g, "{{last_name}}")
                    .replace(/\{\{CompanyName\}\}/g, "{{company}}")
                    .replace(/\{\{JobTitle\}\}/g, "{{title}}");

                return {
                    id: null,
                    seq_number: idx + 1,
                    subject: idx === 0 ? subject : "",
                    email_body: email_body,
                    seq_delay_details: {
                        delay_in_days: idx === 0 ? 0 : (s.wait_after !== undefined ? s.wait_after : 3),
                    },
                };
            });

            const postData = JSON.stringify({ sequences });
            let result = await postSequences(smartleadId, postData, PRIMARY_KEY);
            if ((result.statusCode === 401 || result.statusCode === 404) && SECONDARY_KEY && PRIMARY_KEY !== SECONDARY_KEY) {
                try {
                    const fallback = await postSequences(smartleadId, postData, SECONDARY_KEY);
                    if (fallback.statusCode >= 200 && fallback.statusCode < 300) {
                        result = fallback;
                    }
                } catch { }
            }

            res.writeHead(result.statusCode, { "Content-Type": "application/json" });
            res.end(result.data || JSON.stringify({ success: true }));
        } catch (e: any) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: e.message }));
        }
    });
}

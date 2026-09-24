import type { IncomingMessage, ServerResponse } from "http";
import https from "https";

const envKey = process.env.SMARTLEAD_API_KEY;
const PRIMARY_KEY = (envKey && !envKey.startsWith("412be3a1")) ? envKey : "39e19d19-23fa-4276-aff2-4c8b834eb4ce_3g8knd6";
const SECONDARY_KEY = "e4ebd3cd-1171-4f5c-96a0-7419847b7c44_asttizt";

function postSequences(smartleadId: string, postData: string, apiKey: string): Promise<{ statusCode: number; data: string }> {
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
            if (result.statusCode === 401 || result.statusCode === 404) {
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

import type { IncomingMessage, ServerResponse } from "http";
import https from "https";
import { smartleadPrimary, smartleadSecondary } from "../../server/smartleadKeys";
import { requireUser } from "../../server/handlers/auth";

const PRIMARY_KEY = smartleadPrimary();
const SECONDARY_KEY = smartleadSecondary();

function apiRequest(path: string, method: string = "GET", postData?: string, apiKey: string = PRIMARY_KEY): Promise<{ statusCode: number; data: string }> {
    if (!apiKey) {
        return Promise.resolve({ statusCode: 503, data: JSON.stringify({ error: "smartlead_api_key_not_configured" }) });
    }
    return new Promise((resolve, reject) => {
        const separator = path.includes("?") ? "&" : "?";
        const targetUrl = `https://server.smartlead.ai/api/v1${path}${separator}api_key=${apiKey}`;
        const parsedUrl = new URL(targetUrl);

        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            method,
            headers: {
                "Content-Type": "application/json",
                ...(postData ? { "Content-Length": Buffer.byteLength(postData) } : {}),
            },
        };

        const req = https.request(options, (slRes) => {
            let data = "";
            slRes.on("data", (chunk) => { data += chunk; });
            slRes.on("end", () => {
                resolve({ statusCode: slRes.statusCode || 200, data });
            });
        });

        req.on("error", (err) => reject(err));
        if (postData) req.write(postData);
        req.end();
    });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
        res.statusCode = 200;
        res.end();
        return;
    }

    const user = await requireUser(req, res);
    if (!user) return;

    const url = new URL(req.url || "", "https://email-system-omega.vercel.app");
    const rawId = url.searchParams.get("id") || "4015596";
    if (!/^\d+$/.test(rawId)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_id", message: "Campaign ID must be a numeric string" }));
        return;
    }
    const smartleadId = rawId;
    const customApiKey = url.searchParams.get("api_key");
    const initialKey = customApiKey || PRIMARY_KEY;

    if (req.method === "GET") {
        try {
            let result = await apiRequest(`/campaigns/${smartleadId}`, "GET", undefined, initialKey);
            if ((result.statusCode === 401 || result.statusCode === 404) && !customApiKey && SECONDARY_KEY && initialKey !== SECONDARY_KEY) {
                try {
                    const fallback = await apiRequest(`/campaigns/${smartleadId}`, "GET", undefined, SECONDARY_KEY);
                    if (fallback.statusCode >= 200 && fallback.statusCode < 300) {
                        result = fallback;
                    }
                } catch { }
            }
            res.writeHead(result.statusCode, { "Content-Type": "application/json" });
            res.end(result.data);
            return;
        } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
            return;
        }
    }

    if (req.method === "POST") {
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        req.on("end", async () => {
            try {
                const parsed = JSON.parse(body || "{}");
                const newStatus = (parsed.status || "PAUSED").toUpperCase();
                const postData = JSON.stringify({ status: newStatus });

                let result = await apiRequest(`/campaigns/${smartleadId}/status`, "POST", postData, initialKey);
                if ((result.statusCode === 401 || result.statusCode === 404) && !customApiKey && SECONDARY_KEY && initialKey !== SECONDARY_KEY) {
                    try {
                        const fallback = await apiRequest(`/campaigns/${smartleadId}/status`, "POST", postData, SECONDARY_KEY);
                        if (fallback.statusCode >= 200 && fallback.statusCode < 300) {
                            result = fallback;
                        }
                    } catch { }
                }

                res.writeHead(result.statusCode, { "Content-Type": "application/json" });
                res.end(result.data || JSON.stringify({ success: true, status: newStatus }));
            } catch (e: any) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: e.message }));
            }
        });
        return;
    }

    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Method not allowed" }));
}

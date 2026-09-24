import type { IncomingMessage, ServerResponse } from "http";
import https from "https";

const envKey = process.env.SMARTLEAD_API_KEY;
const PRIMARY_KEY = (envKey && !envKey.startsWith("412be3a1")) ? envKey : "39e19d19-23fa-4276-aff2-4c8b834eb4ce_3g8knd6";
const SECONDARY_KEY = "e4ebd3cd-1171-4f5c-96a0-7419847b7c44_asttizt";

function apiRequest(path: string, method: string = "GET", postData?: string, apiKey: string = PRIMARY_KEY): Promise<{ statusCode: number; data: string }> {
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
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.statusCode = 200;
        res.end();
        return;
    }

    const url = new URL(req.url || "", "https://email-system-omega.vercel.app");
    const smartleadId = url.searchParams.get("id") || "4015596";
    const customApiKey = url.searchParams.get("api_key");
    const initialKey = customApiKey || PRIMARY_KEY;

    if (req.method === "GET") {
        try {
            let result = await apiRequest(`/campaigns/${smartleadId}`, "GET", undefined, initialKey);
            if ((result.statusCode === 401 || result.statusCode === 404) && !customApiKey) {
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
                if ((result.statusCode === 401 || result.statusCode === 404) && !customApiKey) {
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

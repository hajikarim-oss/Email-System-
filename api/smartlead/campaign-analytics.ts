import type { IncomingMessage, ServerResponse } from "http";
import https from "https";

const envKey = process.env.SMARTLEAD_API_KEY;
const PRIMARY_KEY = (envKey && !envKey.startsWith("412be3a1")) ? envKey : "39e19d19-23fa-4276-aff2-4c8b834eb4ce_3g8knd6";
const SECONDARY_KEY = "e4ebd3cd-1171-4f5c-96a0-7419847b7c44_asttizt";

function fetchAnalytics(smartleadId: string, apiKey: string): Promise<{ statusCode: number; data: string }> {
    return new Promise((resolve, reject) => {
        const targetUrl = `https://server.smartlead.ai/api/v1/campaigns/${smartleadId}/analytics?api_key=${apiKey}`;
        https.get(targetUrl, (slRes) => {
            let data = "";
            slRes.on("data", (chunk) => { data += chunk; });
            slRes.on("end", () => {
                resolve({ statusCode: slRes.statusCode || 200, data });
            });
        }).on("error", (err) => reject(err));
    });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
        res.statusCode = 200;
        res.end();
        return;
    }

    try {
        const url = new URL(req.url || "", "https://email-system-omega.vercel.app");
        const smartleadId = url.searchParams.get("id") || "4015596";
        const customApiKey = url.searchParams.get("api_key");
        const initialKey = customApiKey || PRIMARY_KEY;

        let result = await fetchAnalytics(smartleadId, initialKey);

        // If unauthorized or not found and no explicit custom key was provided, try secondary key
        if ((result.statusCode === 401 || result.statusCode === 404) && !customApiKey) {
            try {
                const fallbackResult = await fetchAnalytics(smartleadId, SECONDARY_KEY);
                if (fallbackResult.statusCode >= 200 && fallbackResult.statusCode < 300) {
                    result = fallbackResult;
                }
            } catch { }
        }

        res.writeHead(result.statusCode, { "Content-Type": "application/json" });
        res.end(result.data);
    } catch (e: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
    }
}

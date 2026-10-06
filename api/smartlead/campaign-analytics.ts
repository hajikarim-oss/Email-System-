import type { IncomingMessage, ServerResponse } from "http";
import https from "https";
import { smartleadPrimary, smartleadSecondary } from "../../server/smartleadKeys";
import { requireUser } from "../../server/handlers/auth";

const PRIMARY_KEY = smartleadPrimary();
const SECONDARY_KEY = smartleadSecondary();

function fetchAnalytics(smartleadId: string, apiKey: string): Promise<{ statusCode: number; data: string }> {
    if (!apiKey) {
        return Promise.resolve({ statusCode: 503, data: JSON.stringify({ error: "smartlead_api_key_not_configured" }) });
    }
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
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
        res.statusCode = 200;
        res.end();
        return;
    }

    const user = await requireUser(req, res);
    if (!user) return;

    try {
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

        let result = await fetchAnalytics(smartleadId, initialKey);

        // If unauthorized or not found and no explicit custom key was provided, try secondary key
        if ((result.statusCode === 401 || result.statusCode === 404) && !customApiKey && SECONDARY_KEY && initialKey !== SECONDARY_KEY) {
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

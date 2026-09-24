import type { IncomingMessage, ServerResponse } from "http";
import https from "https";

const DEFAULT_SMARTLEAD_KEY = process.env.SMARTLEAD_API_KEY || "39e19d19-23fa-4276-aff2-4c8b834eb4ce_3g8knd6";

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
        const smartleadId = url.searchParams.get("id") || "3980868";
        const apiKey = url.searchParams.get("api_key") || DEFAULT_SMARTLEAD_KEY;

        const targetUrl = `https://server.smartlead.ai/api/v1/campaigns/${smartleadId}/analytics?api_key=${apiKey}`;

        https.get(targetUrl, (slRes) => {
            let data = "";
            slRes.on("data", (chunk) => { data += chunk; });
            slRes.on("end", () => {
                res.writeHead(slRes.statusCode || 200, { "Content-Type": "application/json" });
                res.end(data);
            });
        }).on("error", (err) => {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
        });
    } catch (e: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
    }
}

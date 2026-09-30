import type { IncomingMessage, ServerResponse } from "http";
import https from "https";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
        res.statusCode = 200;
        return res.end();
    }

    const SMARTLEAD_KEYS = [
        "39e19d19-23fa-4276-aff2-4c8b834eb4ce_3g8knd6", // Vatsal
        "e4ebd3cd-1171-4f5c-96a0-7419847b7c44_asttizt", // Preeti
    ];

    function fetchCampaigns(apiKey: string): Promise<any[]> {
        return new Promise((resolve) => {
            const url = `https://server.smartlead.ai/api/v1/campaigns?api_key=${apiKey}`;
            const clientReq = https.get(url, (clientRes) => {
                let text = "";
                clientRes.on("data", (chunk) => { text += chunk; });
                clientRes.on("end", () => {
                    try {
                        const parsed = JSON.parse(text);
                        resolve(Array.isArray(parsed) ? parsed : []);
                    } catch {
                        resolve([]);
                    }
                });
            });
            clientReq.on("error", () => resolve([]));
            clientReq.setTimeout(6000, () => {
                clientReq.destroy();
                resolve([]);
            });
        });
    }

    try {
        const results = await Promise.all(SMARTLEAD_KEYS.map((k) => fetchCampaigns(k)));
        const flat = results.flat();
        
        // Deduplicate by id
        const seen = new Set<number>();
        const unique = flat.filter((c) => {
            if (!c?.id || seen.has(c.id)) return false;
            seen.add(c.id);
            return true;
        });

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify(unique));
    } catch (err: any) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ error: err?.message || "Failed to fetch Smartlead campaigns" }));
    }
}

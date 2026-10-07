import type { IncomingMessage, ServerResponse } from "http";
import https from "https";
import { smartleadPrimary, smartleadSecondary } from "../../server/smartleadKeys";
import { requireUser } from "../../server/handlers/auth";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
        res.statusCode = 200;
        return res.end();
    }

    const user = await requireUser(req, res);
    if (!user) return;

    const SMARTLEAD_KEYS = [
        smartleadPrimary(),   // shared pool (Vatsal's account)
        smartleadSecondary(), // Preeti's dedicated account
    ].filter(Boolean);

    if (SMARTLEAD_KEYS.length === 0) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "smartlead_api_key_not_configured" }));
        return;
    }

    if (req.method === "DELETE") {
        const url = new URL(req.url || "", "http://localhost");
        const parts = url.pathname.split("/").filter(Boolean);
        let id = url.searchParams.get("id");
        if (!id && parts.length > 0) {
            const last = parts[parts.length - 1];
            if (last !== "campaigns") id = last;
        }

        if (!id) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            return res.end(JSON.stringify({ error: "missing_id" }));
        }

        function deleteCamp(apiKey: string): Promise<boolean> {
            return new Promise((resolve) => {
                const targetUrl = `https://server.smartlead.ai/api/v1/campaigns/${id}?api_key=${apiKey}`;
                const parsedUrl = new URL(targetUrl);
                const clientReq = https.request(
                    {
                        hostname: parsedUrl.hostname,
                        path: parsedUrl.pathname + parsedUrl.search,
                        method: "DELETE",
                        headers: { "Content-Type": "application/json" },
                    },
                    (clientRes) => {
                        resolve(clientRes.statusCode === 200 || clientRes.statusCode === 204);
                    }
                );
                clientReq.on("error", () => resolve(false));
                clientReq.setTimeout(6000, () => {
                    clientReq.destroy();
                    resolve(false);
                });
                clientReq.end();
            });
        }

        await Promise.all(SMARTLEAD_KEYS.map((k) => deleteCamp(k)));
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ success: true, deleted_id: id }));
    }

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

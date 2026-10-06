import type { IncomingMessage, ServerResponse } from "http";
import https from "https";
import { smartleadKeyForSender, smartleadPrimary, smartleadSecondary } from "../../server/smartleadKeys";
import { requireUser } from "../../server/handlers/auth";

const PRIMARY_KEY = smartleadPrimary();
const SECONDARY_KEY = smartleadSecondary();

function apiCall(endpoint: string, method: string = "GET", body?: any, apiKey: string = PRIMARY_KEY): Promise<{ status: number; data: any }> {
    if (!apiKey) {
        return Promise.resolve({ status: 503, data: { error: "smartlead_api_key_not_configured" } });
    }
    return new Promise((resolve, reject) => {
        const separator = endpoint.includes("?") ? "&" : "?";
        const fullPath = `${endpoint}${separator}api_key=${apiKey}`;
        const url = `https://server.smartlead.ai/api/v1${fullPath}`;
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
            res.on("end", () => {
                try {
                    resolve({ status: res.statusCode || 200, data: text ? JSON.parse(text) : {} });
                } catch {
                    resolve({ status: res.statusCode || 200, data: { raw: text } });
                }
            });
        });
        req.on("error", (err: any) => reject(err));
        if (payload) req.write(payload);
        req.end();
    });
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

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

    const user = await requireUser(req, res);
    if (!user) return;

    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", async () => {
        try {
            const parsed = JSON.parse(body || "{}");
            const campaignName = parsed.name || `Campaign ${Date.now()}`;
            const sender = (parsed.sender_email || "").toLowerCase();
            const chosenKey = smartleadKeyForSender(sender, parsed.api_key);

            let createRes = await apiCall("/campaigns/create", "POST", { name: campaignName }, chosenKey);
            if ((createRes.status === 401 || createRes.status === 404) && !parsed.api_key && SECONDARY_KEY && chosenKey !== SECONDARY_KEY) {
                try {
                    const fallback = await apiCall("/campaigns/create", "POST", { name: campaignName }, SECONDARY_KEY);
                    if (fallback.status >= 200 && fallback.status < 300) {
                        createRes = fallback;
                    }
                } catch { }
            }

            res.writeHead(createRes.status, { "Content-Type": "application/json" });
            res.end(JSON.stringify(createRes.data));
        } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
        }
    });
}

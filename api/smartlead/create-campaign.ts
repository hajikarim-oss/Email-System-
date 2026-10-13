import type { IncomingMessage, ServerResponse } from "http";
import https from "https";
import { smartleadKeyForSender, smartleadPrimary, smartleadSecondary } from "../../server/smartleadKeys";
import { requireUser } from "../../server/handlers/auth";
import { pgQuery } from "../../server/pg";

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

function generateCuid(): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 10);
    return `c${ts}${rand}`;
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
            const campaignName = (parsed.name || "").trim();
            if (!campaignName) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "campaign_name_required" }));
                return;
            }
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

            // Persist to database so the campaign is tracked
            if (createRes.status >= 200 && createRes.status < 300 && createRes.data?.id) {
                const providerCampaignId = String(createRes.data.id);
                try {
                    const existing = await pgQuery(
                        `SELECT id FROM "Campaign" WHERE "providerCampaignId" = $1 LIMIT 1`,
                        [providerCampaignId]
                    );
                    if (existing.length === 0) {
                        const existingByName = await pgQuery(
                            `SELECT id FROM "Campaign" WHERE "userId" = $1 AND name = $2 LIMIT 1`,
                            [user.id, campaignName]
                        );
                        if (existingByName.length > 0) {
                            await pgQuery(
                                `UPDATE "Campaign" SET "providerCampaignId" = $1, "updatedAt" = NOW() WHERE id = $2`,
                                [providerCampaignId, existingByName[0].id]
                            );
                        } else {
                            const id = generateCuid();
                            await pgQuery(
                                `INSERT INTO "Campaign" (id, "userId", name, status, "providerCampaignId", "sendTimezone", "preferredSendDays", "createdAt", "updatedAt")
                                 VALUES ($1, $2, $3, 'DRAFT', $4, 'Asia/Kolkata', '{1,2,3,4,5}', NOW(), NOW())`,
                                [id, user.id, campaignName, providerCampaignId]
                            );
                        }
                    }
                } catch (dbErr: any) {
                    console.error("[create-campaign] DB persist failed (campaign still created on Smartlead):", dbErr.message);
                }
            }

            res.writeHead(createRes.status, { "Content-Type": "application/json" });
            res.end(JSON.stringify(createRes.data));
        } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
        }
    });
}

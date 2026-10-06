import http, { type IncomingMessage, type ServerResponse } from "node:http";
import analyticsDashboard from "../server/handlers/analytics-dashboard";
import analyticsReport from "../server/handlers/analytics-report";
import auth from "../server/handlers/auth";
import campaignAnalytics from "../server/handlers/campaign-analytics";
import campaignStats from "../server/handlers/campaign-stats";
import intelligenceMailboxes from "../server/handlers/mailboxes";
import intelligenceContacts from "./intelligence/contacts";
import organization from "../server/handlers/organization";
import smartleadStatus from "./smartlead/status";
import smartleadCreateCampaign from "./smartlead/create-campaign";
import smartleadCampaigns from "./smartlead/campaigns";
import smartleadCampaignAnalytics from "./smartlead/campaign-analytics";
import smartleadCampaignLeadsStats from "./smartlead/campaign-leads-stats";
import smartleadSyncAndStart from "./smartlead/sync-and-start";
import smartleadUpdateSequences from "./smartlead/update-sequences";
import webhookSmartlead from "./webhooks/smartlead";
import chat from "./chat";

type Handler = (req: IncomingMessage, res: ServerResponse) => unknown | Promise<unknown>;

// Multiplex all production routes for Email System 101
// Acts as both a standalone high-throughput Node.js daemon (for VPS/PM2)
// and an exported serverless handler (for Vercel backwards-compatibility).
const routes: Record<string, Handler> = {
    "/api/analytics/dashboard": analyticsDashboard,
    "/api/analytics/report": analyticsReport,
    "/api/campaigns/stats": campaignStats,
    "/api/campaigns/analytics": campaignAnalytics,
    "/api/intelligence/mailboxes": intelligenceMailboxes,
    "/api/intelligence/contacts": intelligenceContacts,
    "/api/smartlead/status": smartleadStatus,
    "/api/smartlead/create-campaign": smartleadCreateCampaign,
    "/api/smartlead/campaigns": smartleadCampaigns,
    "/api/smartlead/campaign-analytics": smartleadCampaignAnalytics,
    "/api/smartlead/campaign-leads-stats": smartleadCampaignLeadsStats,
    "/api/smartlead/sync-and-start": smartleadSyncAndStart,
    "/api/smartlead/update-sequences": smartleadUpdateSequences,
    "/api/webhooks/smartlead": webhookSmartlead,
    "/api/chat": chat,
    "/api/health": (_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() }));
    },
    "/healthz": (_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", uptime: process.uptime(), timestamp: new Date().toISOString() }));
    },
};

// Prefix routes: exact-path map above wins first, then these.
const prefixes: [string, Handler][] = [
    ["/api/auth/", auth],
    ["/api/organization", organization],
];

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    const raw = (req.url || "/").split("?")[0];
    const pathname = raw.replace(/\/+$/, "") || "/";

    // Global CORS preflight & headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-webhook-signature, x-smartlead-signature");

    if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
    }

    const target = routes[pathname] ?? prefixes.find(([prefix]) => pathname.startsWith(prefix))?.[1];

    if (!target) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not_found", path: pathname }));
        return;
    }

    return target(req, res);
}

// Start standalone HTTP daemon when executed directly by PM2 or node/tsx
const isDirectExecution =
    !process.env.VERCEL &&
    (process.env.STANDALONE_SERVER === "true" ||
     process.argv[1]?.endsWith("api/index.ts") ||
     process.argv[1]?.endsWith("api\\index.ts") ||
     process.argv[1]?.includes("api/index") ||
     process.argv[1]?.includes("api\\index") ||
     require.main === module);

if (isDirectExecution) {
    const port = Number(process.env.PORT) || 3001;
    const host = process.env.HOST || "0.0.0.0";
    const server = http.createServer((req, res) => {
        Promise.resolve(handler(req, res)).catch((err) => {
            console.error("[Unhandled API Error]", err);
            if (!res.headersSent) {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "internal_server_error", message: err?.message }));
            }
        });
    });

    server.listen(port, host, () => {
        console.log(`[Email System API] Listening on http://${host}:${port} (PID: ${process.pid})`);
    });

    const shutdown = (signal: string) => {
        console.log(`[Email System API] Received ${signal}, closing server gracefully...`);
        server.close(() => {
            console.log("[Email System API] Server closed.");
            process.exit(0);
        });
        setTimeout(() => process.exit(1), 5000);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
}

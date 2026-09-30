import type { IncomingMessage, ServerResponse } from "http";
import analyticsDashboard from "../server/handlers/analytics-dashboard";
import analyticsReport from "../server/handlers/analytics-report";
import campaignAnalytics from "../server/handlers/campaign-analytics";
import campaignStats from "../server/handlers/campaign-stats";
import intelligenceMailboxes from "../server/handlers/mailboxes";

type Handler = (req: IncomingMessage, res: ServerResponse) => unknown | Promise<unknown>;

// The Hobby plan caps a deployment at 12 serverless functions and this repo
// already ships 10 individual handlers in api/, so these routes share one
// function instead of one file each. vercel.json rewrites unmatched /api/*
// paths here (existing api/*.ts files are matched first and keep their own
// routes); Vercel preserves the original req.url, so the dispatch below sees
// the real path.
const routes: Record<string, Handler> = {
    "/api/analytics/dashboard": analyticsDashboard,
    "/api/analytics/report": analyticsReport,
    "/api/campaigns/stats": campaignStats,
    "/api/campaigns/analytics": campaignAnalytics,
    "/api/intelligence/mailboxes": intelligenceMailboxes,
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    const raw = (req.url || "/").split("?")[0];
    const pathname = raw.replace(/\/+$/, "") || "/";
    const target = routes[pathname];

    if (!target) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "not_found", path: pathname }));
        return;
    }

    return target(req, res);
}

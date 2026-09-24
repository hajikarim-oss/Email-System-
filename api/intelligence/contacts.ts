import type { IncomingMessage, ServerResponse } from "http";
import q3LuggageLeads from "../../web/src/lib/api/q3LuggageLeads.json";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    try {
        const urlObj = new URL(req.url || "", "http://localhost:3000");
        const query = (urlObj.searchParams.get("query") || urlObj.searchParams.get("q") || "").trim().toLowerCase();
        const page = Math.max(1, parseInt(urlObj.searchParams.get("page") || "1", 10));
        const limit = Math.min(100, Math.max(1, parseInt(urlObj.searchParams.get("limit") || "50", 10)));
        const campaignId = urlObj.searchParams.get("campaign_id") || "";
        const campaignIds = urlObj.searchParams.get("campaign_ids") ? urlObj.searchParams.get("campaign_ids")!.split(",") : [];

        const isQ3 = campaignId.includes("1790233732719") || campaignId === "cmp_1790233732719_dvlj" || campaignIds.includes("cmp_1790233732719_dvlj");

        let leadsList = (q3LuggageLeads as any[]);

        if (query) {
            leadsList = leadsList.filter((l: any) => {
                const fullName = `${l.first_name || ""} ${l.last_name || ""}`.trim().toLowerCase();
                const em = (l.email || "").toLowerCase();
                const comp = (l.company || l.company_name || "").toLowerCase();
                return fullName.includes(query) || em.includes(query) || comp.includes(query);
            });
        }

        const total = leadsList.length;
        const startIndex = (page - 1) * limit;
        const pagedLeads = leadsList.slice(startIndex, startIndex + limit);

        const mappedContacts = pagedLeads.map((l: any) => ({
            id: l.id,
            first_name: l.first_name,
            last_name: l.last_name,
            email: l.email,
            company: l.company,
            is_email_handler: false,
            email_handler: null,
            phone: "",
            custom_fields: l.custom_fields || {},
            subscribed: l.status !== "bounced" && l.status !== "unsubscribed",
            status: l.status === "bounced" ? "bounced" : "active",
            verification_status: l.status === "bounced" ? "invalid" : "valid",
            campaigns: [{ id: "cmp_1790233732719_dvlj", name: "Q3 Campaign" }],
            campaign_lead: l.campaign_lead,
            categories: [
                {
                    id: l.status === "completed" ? "WARM_STALE" : "COLD_REENGAGEMENT",
                    title: l.status === "completed" ? "WARM STALE" : "COLD REENGAGEMENT",
                    color: l.status === "completed" ? "#f59e0b" : "#8b5cf6"
                }
            ],
            engagement_state: {
                total_messages: l.status === "completed" ? 1 : 0,
                total_replied: 0,
                reply_classification: l.status === "bounced" ? "bounced" : "delivered"
            },
            last_message_context: {
                id: null,
                subject: "Influencer marketing partnerships",
                body_hook: "We run creator-led campaigns for brands like Atomberg and Wakefit...",
                sender: l.sent_by_mailbox || "vatsal.vadecha@theboredmonkey.com",
                campaign: "Q3 Campaign",
                outcome: l.status === "bounced" ? "bounced" : "delivered",
                date: l.last_contacted_at || new Date().toISOString()
            },
            tags: ["outreach", "luggage"],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }));

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            data: mappedContacts,
            total: total,
            counts: {
                total: 28091,
                subscribed: 24359,
                unsubscribed: 3732,
                in_campaign: total,
                not_contacted: 1737,
                categories: [
                    { category_id: "DORMANT_REPLIED", count: 747 },
                    { category_id: "COLD_REENGAGEMENT", count: 22896 },
                    { category_id: "WARM_STALE", count: 694 },
                    { category_id: "BURNED", count: 3730 }
                ]
            },
            lead_counts: {
                total: 1785,
                queued: 1737,
                processing: 0,
                completed: 48,
                replied: 0,
                bounced: 4,
                failed: 0,
                unsubscribed: 0,
                undeliverable: 0,
                opened: 22,
                not_opened: 26,
                clicked: 1,
                not_clicked: 47,
                not_replied: 48
            },
            pagination: {
                total: total,
                page: page,
                limit: limit,
                has_more: startIndex + limit < total
            }
        }));
    } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message || "Internal server error" }));
    }
}

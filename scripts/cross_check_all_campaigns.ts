import { pgQuery } from "../server/pg";

async function crossCheckAllCampaigns() {
  console.log("==========================================================================");
  console.log("🔍 COMPREHENSIVE CAMPAIGN CROSS-CHECK REPORT (Database vs Telemetry)");
  console.log("==========================================================================\n");

  const campaigns = await pgQuery<{
    id: string;
    name: string;
    status: string;
    providerCampaignId: string | null;
    ownerName: string | null;
    ownerEmail: string | null;
    totalLeads: number;
    contactedLeads: number;
    leadsSent7d: number;
    leadsOpened: number;
    leadsReplied: number;
    leadsBounced: number;
    eventsSent7d: number;
    eventsOpens7d: number;
    eventsReplies7d: number;
    eventsBounces7d: number;
  }>(`
    WITH lead_agg AS (
      SELECT 
        l."campaignId",
        count(*)::int AS total_leads,
        count(*) FILTER (WHERE l."lastContactedAt" IS NOT NULL)::int AS contacted_leads,
        count(*) FILTER (WHERE l."lastContactedAt" >= NOW() - INTERVAL '7 days')::int AS sent_7d,
        count(*) FILTER (WHERE l."openCount" > 0 OR l."firstOpenAt" IS NOT NULL OR l."lastOpenAt" IS NOT NULL)::int AS opened_leads,
        count(*) FILTER (WHERE l."totalReplied" > 0 OR l."repliedAt" IS NOT NULL OR l."lastRepliedAt" IS NOT NULL)::int AS replied_leads,
        count(*) FILTER (WHERE l."totalBounced" > 0 OR l."bounceCount" > 0 OR l."lastBouncedAt" IS NOT NULL)::int AS bounced_leads
      FROM "Lead" l
      WHERE l."campaignId" IS NOT NULL
      GROUP BY l."campaignId"
    ),
    event_agg_7d AS (
      SELECT 
        l."campaignId",
        count(*) FILTER (WHERE lower(e."eventType") IN ('sent', 'email_sent'))::int AS events_sent_7d,
        count(*) FILTER (WHERE lower(e."eventType") IN ('opened', 'email_open', 'open'))::int AS events_opens_7d,
        count(*) FILTER (WHERE lower(e."eventType") IN ('replied', 'email_reply', 'reply'))::int AS events_replies_7d,
        count(*) FILTER (WHERE lower(e."eventType") IN ('bounced', 'email_bounce', 'hard_bounce', 'soft_bounce'))::int AS events_bounces_7d
      FROM "EmailEvent" e
      JOIN "Lead" l ON l.id = e."leadId"
      WHERE e."createdAt" >= NOW() - INTERVAL '7 days'
      GROUP BY l."campaignId"
    )
    SELECT 
      c.id,
      c.name,
      c.status,
      c."providerCampaignId",
      u.name AS "ownerName",
      u.email AS "ownerEmail",
      coalesce(la.total_leads, 0)::int AS "totalLeads",
      coalesce(la.contacted_leads, 0)::int AS "contactedLeads",
      coalesce(la.sent_7d, 0)::int AS "leadsSent7d",
      coalesce(la.opened_leads, 0)::int AS "leadsOpened",
      coalesce(la.replied_leads, 0)::int AS "leadsReplied",
      coalesce(la.bounced_leads, 0)::int AS "leadsBounced",
      coalesce(ea.events_sent_7d, 0)::int AS "eventsSent7d",
      coalesce(ea.events_opens_7d, 0)::int AS "eventsOpens7d",
      coalesce(ea.events_replies_7d, 0)::int AS "eventsReplies7d",
      coalesce(ea.events_bounces_7d, 0)::int AS "eventsBounces7d"
    FROM "Campaign" c
    LEFT JOIN "User" u ON u.id = c."userId"
    LEFT JOIN lead_agg la ON (la."campaignId" = c.id OR la."campaignId" = c."providerCampaignId")
    LEFT JOIN event_agg_7d ea ON (ea."campaignId" = c.id OR ea."campaignId" = c."providerCampaignId")
    ORDER BY coalesce(la.sent_7d, 0) DESC, coalesce(la.total_leads, 0) DESC
  `);

  console.log(`Total Campaigns found in DB: ${campaigns.length}\n`);

  const activeWithActivity = campaigns.filter(c => c.totalLeads > 0 || c.leadsSent7d > 0);
  console.log(`Campaigns with Leads or Outreach History: ${activeWithActivity.length}\n`);

  console.log("------------------------------------------------------------------------------------------------------------------------------------------------");
  console.log(
    "CAMPAIGN NAME".padEnd(38) + " | " +
    "OWNER".padEnd(16) + " | " +
    "STATUS".padEnd(8) + " | " +
    "TOTAL".padStart(6) + " | " +
    "CONTACTED".padStart(9) + " | " +
    "SENT 7D".padStart(8) + " | " +
    "OPENS".padStart(6) + " | " +
    "REPLIES".padStart(7) + " | " +
    "BOUNCES".padStart(7)
  );
  console.log("------------------------------------------------------------------------------------------------------------------------------------------------");

  let totalLeadsSum = 0;
  let totalContactedSum = 0;
  let totalSent7dSum = 0;
  let totalOpensSum = 0;
  let totalRepliesSum = 0;
  let totalBouncesSum = 0;

  activeWithActivity.forEach(c => {
    totalLeadsSum += c.totalLeads;
    totalContactedSum += c.contactedLeads;
    totalSent7dSum += c.leadsSent7d;
    totalOpensSum += c.leadsOpened;
    totalRepliesSum += c.leadsReplied;
    totalBouncesSum += c.leadsBounced;

    const shortName = c.name.length > 36 ? c.name.slice(0, 35) + "…" : c.name;
    const shortOwner = (c.ownerName || c.ownerEmail?.split("@")[0] || "Unassigned").slice(0, 16);

    console.log(
      shortName.padEnd(38) + " | " +
      shortOwner.padEnd(16) + " | " +
      c.status.padEnd(8) + " | " +
      c.totalLeads.toString().padStart(6) + " | " +
      c.contactedLeads.toString().padStart(9) + " | " +
      c.leadsSent7d.toString().padStart(8) + " | " +
      c.leadsOpened.toString().padStart(6) + " | " +
      c.leadsReplied.toString().padStart(7) + " | " +
      c.leadsBounced.toString().padStart(7)
    );
  });

  console.log("------------------------------------------------------------------------------------------------------------------------------------------------");
  console.log(
    "TOTALS ACROSS ALL CAMPAIGNS".padEnd(65) +
    totalLeadsSum.toString().padStart(6) + " | " +
    totalContactedSum.toString().padStart(9) + " | " +
    totalSent7dSum.toString().padStart(8) + " | " +
    totalOpensSum.toString().padStart(6) + " | " +
    totalRepliesSum.toString().padStart(7) + " | " +
    totalBouncesSum.toString().padStart(7)
  );
  console.log("================================================================================================================================================\n");

  const unassigned = await pgQuery<{ count: number; contacted: number; sent7d: number }>(`
    SELECT 
      count(*)::int AS count,
      count(*) FILTER (WHERE "lastContactedAt" IS NOT NULL)::int AS contacted,
      count(*) FILTER (WHERE "lastContactedAt" >= NOW() - INTERVAL '7 days')::int AS sent7d
    FROM "Lead"
    WHERE "campaignId" IS NULL
  `);
  console.log(`Unassigned Pool Leads (campaignId is NULL):`);
  console.log(`  Total in pool : ${unassigned[0]?.count || 0}`);
  console.log(`  Contacted     : ${unassigned[0]?.contacted || 0}`);
  console.log(`  Sent last 7d  : ${unassigned[0]?.sent7d || 0}\n`);

  process.exit(0);
}

crossCheckAllCampaigns().catch(err => {
  console.error("Cross-check error:", err);
  process.exit(1);
});

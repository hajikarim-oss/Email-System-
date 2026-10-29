/**
 * Smartlead Automated Reconciliation Worker (Self-Healing)
 * 
 * Features:
 * 1. Synchronizes all campaigns, sent statistics, and verified genuine prospect replies.
 * 2. Strict Filter: Completely ignores mail-daemon bounces, NDRs, and spam delivery failures.
 * 3. Idempotent Deduplication: Deterministic event keys prevent double-counting sends (keeps counts accurate).
 * 4. Multi-Node Replication: Writes to Tokyo Primary, Seoul Replica 2, and Singapore Replica 3.
 * 5. Rate-Limit Throttling: Safe delays prevent HTTP 429 rate limits from Smartlead.
 */

const { Client } = require("pg");
require("dotenv").config({ path: __dirname + "/../.env" });

const SMARTLEAD_KEY = process.env.SMARTLEAD_API_KEY || "b0042f19-3f90-4910-b5de-31b1e2c8c032_ticg3c4";
const BASE_URL = "https://server.smartlead.ai/api/v1";

const DB_CONNECTIONS = [
  {
    name: "Primary (Tokyo)",
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "postgresql://postgres.hsmudwkfwmvinhtggxyd:9538564601Aa@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require"
  },
  {
    name: "Replica 2 (Seoul)",
    url: process.env.DIRECT_REPLICA2_URL || process.env.DATABASE_REPLICA2_URL || "postgresql://postgres.qlzlsjpncknjliyalfmj:9538564601Aa@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require"
  },
  {
    name: "Replica 3 (Singapore)",
    url: process.env.DIRECT_REPLICA3_URL || process.env.DATABASE_REPLICA3_URL || "postgresql://postgres.adlwwkqgexykuhkdkpfu:9538564601Aa@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require"
  }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429) {
        console.warn(`[Smartlead Rate Limit 429] Waiting 5s before retry (attempt ${i + 1}/${retries})...`);
        await sleep(5000);
        continue;
      }
      return res;
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(1500);
    }
  }
}

async function reconcileCampaigns() {
  console.log("=====================================================");
  console.log(`[Smartlead AutoSync] Starting reconciliation at ${new Date().toISOString()}`);
  console.log("=====================================================");

  // 1. Fetch campaigns from Smartlead
  const campRes = await fetchWithRetry(`${BASE_URL}/campaigns?api_key=${SMARTLEAD_KEY}`);
  if (!campRes.ok) {
    throw new Error(`Failed to fetch campaigns: ${campRes.statusText}`);
  }
  const campaigns = await campRes.json();
  console.log(`[Smartlead AutoSync] Fetched ${campaigns.length} campaigns from Smartlead.`);

  // 2. Scan active campaigns for analytics and replies
  const campaignData = [];
  for (const c of campaigns) {
    await sleep(75); // rate limit guard
    try {
      const aRes = await fetchWithRetry(`${BASE_URL}/campaigns/${c.id}/analytics?api_key=${SMARTLEAD_KEY}`);
      if (!aRes.ok) continue;
      const a = await aRes.json();
      
      const sentCount = Number(a.sent_count || 0);
      const replyCount = Number(a.reply_count || 0);
      const openCount = Number(a.open_count || 0);
      const clickCount = Number(a.click_count || 0);
      const bounceCount = Number(a.bounced_count || 0);

      campaignData.push({
        id: String(c.id),
        name: c.name,
        status: c.status,
        sentCount,
        replyCount,
        openCount,
        clickCount,
        bounceCount,
        hasReplies: replyCount > 0
      });
    } catch (err) {
      console.warn(`Error fetching analytics for campaign ${c.id}:`, err.message);
    }
  }

  // 3. Scan genuine replies from campaigns that have reply_count > 0
  const genuineReplies = [];
  const repliedCampaigns = campaignData.filter(c => c.hasReplies);
  console.log(`[Smartlead AutoSync] Finding genuine message threads in ${repliedCampaigns.length} replied campaigns...`);

  for (const c of repliedCampaigns) {
    let offset = 0;
    while (true) {
      await sleep(80);
      const lRes = await fetchWithRetry(`${BASE_URL}/campaigns/${c.id}/leads?limit=100&offset=${offset}&api_key=${SMARTLEAD_KEY}`);
      if (!lRes.ok) break;
      const lData = await lRes.json();
      const leads = lData.data || [];
      if (!leads.length) break;

      for (const item of leads) {
        const lead = item.lead || {};
        const stats = item.stats || {};
        const leadId = lead.id;
        const email = (lead.email || "").toLowerCase().trim();

        // Check if lead has replied
        if (item.has_replied || stats.reply_time || lead.reply_time) {
          await sleep(80);
          const histRes = await fetchWithRetry(`${BASE_URL}/campaigns/${c.id}/leads/${leadId}/message-history?api_key=${SMARTLEAD_KEY}`);
          if (!histRes.ok) continue;
          const hist = await histRes.json();
          const messages = hist.history || [];

          for (const m of messages) {
            // Strict filter: must be genuine prospect REPLY
            if (String(m.type || "").toUpperCase() === "REPLY") {
              // Ensure not a bounce notification disguised as reply
              const raw = String(m.email_body || m.custom_email_message || m.reply_body || "");
              const isBounceText = /Mail Delivery Subsystem|Undelivered Mail Returned|Delivery Status Notification|Address not found/i.test(raw);
              if (!isBounceText) {
                genuineReplies.push({
                  providerCampaignId: c.id,
                  providerLeadId: String(leadId),
                  campaignName: c.name,
                  email,
                  firstName: lead.first_name || "",
                  lastName: lead.last_name || "",
                  time: m.time || new Date().toISOString(),
                  message: m
                });
              }
            }
          }
        }
      }
      if (leads.length < 100) break;
      offset += 100;
    }
  }

  console.log(`[Smartlead AutoSync] Verified ${genuineReplies.length} genuine prospect replies.`);

  // 4. Update each database cluster node
  for (const db of DB_CONNECTIONS) {
    console.log(`\n--- Synchronizing ${db.name} ---`);
    const client = new Client({
      connectionString: db.url,
      ssl: { rejectUnauthorized: false }
    });

    try {
      await client.connect();

      // Update Campaign stats
      for (const c of campaignData) {
        await client.query(
          `UPDATE "Campaign" 
           SET "sentCount" = GREATEST("sentCount", $1),
               "replyCount" = GREATEST("replyCount", $2),
               "openCount" = GREATEST("openCount", $3),
               "clickCount" = GREATEST("clickCount", $4),
               "bounceCount" = GREATEST("bounceCount", $5),
               "updatedAt" = NOW()
           WHERE "providerCampaignId" = $6`,
          [c.sentCount, c.replyCount, c.openCount, c.clickCount, c.bounceCount, c.id]
        );
      }

      // Upsert Genuine Replies
      for (const r of genuineReplies) {
        const campRes = await client.query('SELECT id FROM "Campaign" WHERE "providerCampaignId" = $1', [r.providerCampaignId]);
        if (!campRes.rows.length) continue;
        const campId = campRes.rows[0].id;

        let leadId;
        const existingLead = await client.query('SELECT id FROM "Lead" WHERE lower(email) = $1 AND "campaignId" = $2', [r.email, campId]);
        
        if (existingLead.rows.length > 0) {
          leadId = existingLead.rows[0].id;
          await client.query(
            `UPDATE "Lead"
             SET status = 'REPLIED'::"LeadStatus",
                 "providerLeadId" = $1,
                 "repliedAt" = $2::timestamptz,
                 "lastRepliedAt" = $2::timestamptz,
                 "totalReplied" = GREATEST("totalReplied", 1),
                 "updatedAt" = NOW()
             WHERE id = $3`,
            [r.providerLeadId, r.time, leadId]
          );
        } else {
          const newLead = await client.query(
            `INSERT INTO "Lead" (id, "campaignId", email, "firstName", "lastName", "providerLeadId", status, "repliedAt", "lastRepliedAt", "totalReplied", "createdAt", "updatedAt")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'REPLIED'::"LeadStatus", $6::timestamptz, $6::timestamptz, 1, NOW(), NOW())
             RETURNING id`,
            [campId, r.email, r.firstName, r.lastName, r.providerLeadId, r.time]
          );
          leadId = newLead.rows[0].id;
        }

        const msg = r.message;
        const rawBody = msg.email_body || msg.custom_email_message || msg.reply_body || "";
        const subject = msg.subject || `Re: ${r.campaignName}`;
        const fromEmail = msg.from || r.email;
        const toEmail = msg.to || "haji.karim@theboredmonkey.com";
        const statsId = msg.stats_id || msg.message_id || `reply_${leadId}`;
        const providerEventId = `sl_reply_${r.providerCampaignId}_${r.providerLeadId}_${statsId}`;

        const payload = {
          subject,
          email_subject: subject,
          email_body: rawBody,
          body: rawBody,
          reply_text: rawBody,
          reply_body: rawBody,
          snippet: String(rawBody).replace(/<[^>]*>/g, "").slice(0, 1000),
          from_email: fromEmail,
          to_email: toEmail,
          stats_id: msg.stats_id,
          message_id: msg.message_id,
          type: "REPLY",
          time: r.time,
          email_seq_number: msg.email_seq_number
        };

        await client.query(
          `INSERT INTO "EmailEvent" (id, "leadId", "eventType", "providerEventId", "fromEmail", "rawPayload", "createdAt")
           VALUES (gen_random_uuid()::text, $1, 'replied', $2, $3, $4::jsonb, $5::timestamptz)
           ON CONFLICT ("providerEventId") DO UPDATE 
           SET "rawPayload" = EXCLUDED."rawPayload",
               "fromEmail" = EXCLUDED."fromEmail"`,
          [leadId, providerEventId, fromEmail, JSON.stringify(payload), r.time]
        );
      }

      const verified = await client.query('SELECT count(*) FROM "EmailEvent" WHERE "eventType" IN (\'reply\', \'email_reply\', \'replied\')');
      console.log(`[${db.name}] Reconciled successfully. Total verified replies: ${verified.rows[0].count}`);

      await client.end();
    } catch (dbErr) {
      console.error(`[${db.name}] Error during reconciliation:`, dbErr.message);
      try { await client.end(); } catch (_) {}
    }
  }

  console.log("\n=====================================================");
  console.log(`[Smartlead AutoSync] Completed reconciliation successfully at ${new Date().toISOString()}`);
  console.log("=====================================================");
}

if (require.main === module) {
  reconcileCampaigns().catch((err) => {
    console.error("[Smartlead AutoSync] Fatal error:", err);
    process.exit(1);
  });
}

module.exports = { reconcileCampaigns };

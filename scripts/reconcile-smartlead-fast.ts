import { PrismaClient } from "../nexus-outbound/node_modules/@prisma/client";

const SMARTLEAD_BASE = "https://server.smartlead.ai/api/v1";
const API_KEY = "b0042f19-3f90-4910-b5de-31b1e2c8c032_ticg3c4";
const CAMPAIGN_SL_ID = "4111241";

const prisma = new PrismaClient();

async function main() {
  console.log(`=== 1. FETCHING CAMPAIGN ${CAMPAIGN_SL_ID} DETAILS FROM SMARTLEAD ===`);
  const campRes = await fetch(`${SMARTLEAD_BASE}/campaigns/${CAMPAIGN_SL_ID}?api_key=${API_KEY}`);
  const campData = await campRes.json();
  console.log("Smartlead Campaign:", {
    id: campData.id,
    name: campData.name,
    status: campData.status,
    created_at: campData.created_at,
  });

  const dbCamp = await prisma.campaign.findFirst({
    where: {
      OR: [
        { id: "cmv0x5vfu0001dynzwtnxg8ul" },
        { providerCampaignId: CAMPAIGN_SL_ID },
      ],
    },
  });

  if (!dbCamp) {
    console.error("Campaign not found in DB!");
    return;
  }

  // Update status in DB to COMPLETED
  await prisma.campaign.update({
    where: { id: dbCamp.id },
    data: { status: "COMPLETED" },
  });
  console.log(`Updated DB Campaign ${dbCamp.id} status to COMPLETED`);

  console.log("\n=== 2. FETCHING PER-LEAD DETAILED STATISTICS FROM SMARTLEAD ===");
  let offset = 0;
  const limit = 500;
  let allStats: any[] = [];

  while (true) {
    const statsRes = await fetch(`${SMARTLEAD_BASE}/campaigns/${CAMPAIGN_SL_ID}/statistics?limit=${limit}&offset=${offset}&api_key=${API_KEY}`);
    const data = await statsRes.json();
    const batch = Array.isArray(data) ? data : (data.data || []);
    if (batch.length === 0) break;
    allStats = allStats.concat(batch);
    offset += limit;
    if (batch.length < limit) break;
  }
  console.log(`Fetched ${allStats.length} lead activity records from Smartlead.`);

  // Load ALL existing leads in DB for this campaign in ONE query
  const existingLeads = await prisma.lead.findMany({
    where: { campaignId: dbCamp.id },
  });
  const leadMap = new Map<string, typeof existingLeads[0]>();
  existingLeads.forEach(l => leadMap.set(l.email.toLowerCase().trim(), l));
  console.log(`Found ${leadMap.size} existing leads in DB.`);

  // Load ALL existing email events in DB for this campaign in ONE query
  const existingEvents = await prisma.emailEvent.findMany({
    where: { lead: { campaignId: dbCamp.id } },
    select: { leadId: true, eventType: true, providerEventId: true },
  });
  const eventSet = new Set<string>();
  existingEvents.forEach(e => {
    eventSet.add(`${e.leadId}_${e.eventType}`);
    if (e.providerEventId) eventSet.add(e.providerEventId);
  });
  console.log(`Found ${existingEvents.length} existing EmailEvents in DB.`);

  const eventsToCreate: any[] = [];
  const leadsToUpdate: { id: string; data: any }[] = [];

  for (const item of allStats) {
    const email = (item.lead_email || "").toLowerCase().trim();
    if (!email) continue;

    const sentTime = item.sent_time ? new Date(item.sent_time) : null;
    const openTime = item.open_time ? new Date(item.open_time) : null;
    const clickTime = item.click_time ? new Date(item.click_time) : null;
    const replyTime = item.reply_time ? new Date(item.reply_time) : null;
    const openCount = Number(item.open_count || (openTime ? 1 : 0));
    const clickCount = Number(item.click_count || (clickTime ? 1 : 0));
    const isBounced = Boolean(item.is_bounced || item.sender_bounce);

    let status: "ACTIVE" | "REPLIED" | "BOUNCED" | "UNSUBSCRIBED" = "ACTIVE";
    if (isBounced) status = "BOUNCED";
    else if (item.is_unsubscribed) status = "UNSUBSCRIBED";
    else if (replyTime) status = "REPLIED";

    const lead = leadMap.get(email);
    if (!lead) {
      console.warn(`Lead not found in DB: ${email}`);
      continue;
    }

    const leadId = lead.id;
    const patch: any = {};

    if (status === "BOUNCED") {
      patch.status = "BOUNCED";
      patch.bounceCount = Math.max(lead.bounceCount || 0, 1);
      patch.totalBounced = Math.max(lead.totalBounced || 0, 1);
      patch.lastBouncedAt = sentTime || new Date();
    } else if (status === "REPLIED") {
      patch.status = "REPLIED";
      patch.repliedAt = replyTime;
      patch.lastRepliedAt = replyTime;
      patch.totalReplied = Math.max(lead.totalReplied || 0, 1);
    }

    if (sentTime) {
      patch.lastContactedAt = sentTime;
      if (!lead.firstContactedAt) patch.firstContactedAt = sentTime;
      if (!lead.totalMessages) patch.totalMessages = 1;
      if (!lead.totalOutbound) patch.totalOutbound = 1;
    }

    if (openTime || openCount > 0) {
      patch.openCount = Math.max(lead.openCount || 0, openCount);
      if (openTime) {
        if (!lead.firstOpenAt) patch.firstOpenAt = openTime;
        patch.lastOpenAt = openTime;
      }
    }

    if (clickCount > 0) {
      patch.clickCount = Math.max(lead.clickCount || 0, clickCount);
    }

    leadsToUpdate.push({ id: leadId, data: patch });

    // Events to insert
    const statsId = item.stats_id || `${leadId}_${item.sequence_number || 1}`;

    if (sentTime && !eventSet.has(`${leadId}_sent`) && !eventSet.has(`${statsId}_sent`)) {
      eventsToCreate.push({
        leadId,
        eventType: "sent",
        providerEventId: `${statsId}_sent`,
        createdAt: sentTime,
      });
      eventSet.add(`${leadId}_sent`);
    }

    if ((openTime || openCount > 0) && !eventSet.has(`${leadId}_opened`) && !eventSet.has(`${leadId}_email_open`) && !eventSet.has(`${statsId}_open`)) {
      eventsToCreate.push({
        leadId,
        eventType: "opened",
        providerEventId: `${statsId}_open`,
        createdAt: openTime || sentTime || new Date(),
      });
      eventSet.add(`${leadId}_opened`);
    }

    if ((clickTime || clickCount > 0) && !eventSet.has(`${leadId}_clicked`) && !eventSet.has(`${leadId}_email_click`) && !eventSet.has(`${statsId}_click`)) {
      eventsToCreate.push({
        leadId,
        eventType: "clicked",
        providerEventId: `${statsId}_click`,
        createdAt: clickTime || sentTime || new Date(),
      });
      eventSet.add(`${leadId}_clicked`);
    }

    if (isBounced && !eventSet.has(`${leadId}_bounced`) && !eventSet.has(`${leadId}_email_bounce`) && !eventSet.has(`${statsId}_bounce`)) {
      eventsToCreate.push({
        leadId,
        eventType: "bounced",
        providerEventId: `${statsId}_bounce`,
        createdAt: sentTime || new Date(),
      });
      eventSet.add(`${leadId}_bounced`);
    }

    if (replyTime && !eventSet.has(`${leadId}_replied`) && !eventSet.has(`${leadId}_email_reply`) && !eventSet.has(`${statsId}_reply`)) {
      eventsToCreate.push({
        leadId,
        eventType: "replied",
        providerEventId: `${statsId}_reply`,
        createdAt: replyTime,
      });
      eventSet.add(`${leadId}_replied`);
    }
  }

  console.log(`\n=== 3. EXECUTING BATCH UPDATES ===`);
  console.log(`Leads to update: ${leadsToUpdate.length}`);
  console.log(`Events to create: ${eventsToCreate.length}`);

  // Create all events in ONE operation using createMany!
  if (eventsToCreate.length > 0) {
    const res = await prisma.emailEvent.createMany({
      data: eventsToCreate,
      skipDuplicates: true,
    });
    console.log(`Created ${res.count} EmailEvents.`);
  }

  // Update leads in small parallel batches of 20
  const BATCH_SIZE = 20;
  for (let i = 0; i < leadsToUpdate.length; i += BATCH_SIZE) {
    const chunk = leadsToUpdate.slice(i, i + BATCH_SIZE);
    await Promise.all(
      chunk.map(c =>
        prisma.lead.update({
          where: { id: c.id },
          data: c.data,
        })
      )
    );
    console.log(`Updated leads ${Math.min(i + BATCH_SIZE, leadsToUpdate.length)} / ${leadsToUpdate.length}`);
  }

  console.log(`\n=== 4. VERIFYING AGGREGATE STATS IN DB ===`);
  const totalLeads = await prisma.lead.count({ where: { campaignId: dbCamp.id } });
  const contactedLeads = await prisma.lead.count({
    where: { campaignId: dbCamp.id, lastContactedAt: { not: null } },
  });
  const openedLeads = await prisma.lead.count({
    where: { campaignId: dbCamp.id, openCount: { gt: 0 } },
  });
  const repliedLeads = await prisma.lead.count({
    where: { campaignId: dbCamp.id, OR: [{ totalReplied: { gt: 0 } }, { status: "REPLIED" }] },
  });
  const bouncedLeads = await prisma.lead.count({
    where: { campaignId: dbCamp.id, OR: [{ bounceCount: { gt: 0 } }, { status: "BOUNCED" }] },
  });

  console.log("DB Verification Lead Counts:", {
    totalLeads,
    contactedLeads,
    openedLeads,
    repliedLeads,
    bouncedLeads,
  });

  const eventCounts = await prisma.emailEvent.groupBy({
    by: ["eventType"],
    where: { lead: { campaignId: dbCamp.id } },
    _count: { id: true },
  });
  console.log("DB Verification Event Counts:", eventCounts);

  const updatedCamp = await prisma.campaign.findUnique({
    where: { id: dbCamp.id },
    select: { id: true, name: true, status: true },
  });
  console.log("Final Campaign status in DB:", updatedCamp);
}

main()
  .catch((e) => {
    console.error("Fatal sync error:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

# Implementation Guide: Add Live Data Queries to Agent

## Quick Summary

The agent currently loads basic context. To enable intelligent answers like "Which leads went cold?", we need to add live database queries to `buildAssistantContext()`.

This takes **30-45 minutes** to implement.

---

## Step 1: Update buildAssistantContext() in api/agentSessions.ts

Replace the current function with this enhanced version:

```typescript
async function loadUserContext(userId: string) {
  try {
    // EXISTING: Basic stats
    const campaigns = await prisma.campaign.findMany({
      where: { userId },
      select: { id: true, name: true, status: true }
    });

    const leads = await prisma.campaignLead.findMany({
      where: { campaign: { userId } },
      select: { id: true, email: true, status: true }
    });

    const replies = await prisma.campaignLeadReply.findMany({
      where: { lead: { campaign: { userId } } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        body: true,
        status: true,
        lead: { select: { email: true } },
        createdAt: true
      }
    });

    // NEW: Cold leads query (no engagement > 14 days)
    const coldLeadsResult = await prisma.$queryRaw`
      SELECT 
        cl.id, cl.email, cl.name, cl.title, cl.company,
        MAX(clr."createdAt") as "lastEngagementDate",
        CAST(EXTRACT(DAY FROM (NOW() - MAX(clr."createdAt"))) AS INT) as "daysSinceEngagement",
        COUNT(CASE WHEN clr.direction = 'in' THEN 1 END) as "incomingReplies"
      FROM "CampaignLead" cl
      LEFT JOIN "CampaignLeadReply" clr ON cl.id = clr."leadId"
      WHERE cl."userId" = ${userId} 
        AND CAST(EXTRACT(DAY FROM (NOW() - MAX(clr."createdAt"))) AS INT) > 14
      GROUP BY cl.id
      ORDER BY CAST(EXTRACT(DAY FROM (NOW() - MAX(clr."createdAt"))) AS INT) DESC
      LIMIT 10
    ` as any[];

    // NEW: High engagement leads (3+ interactions, multiple positive)
    const highEngagementResult = await prisma.$queryRaw`
      SELECT 
        cl.id, cl.name, cl.email,
        COUNT(clr.id) as "totalReplies",
        COUNT(CASE WHEN clr.status = 'positive' THEN 1 END) as "positiveReplies",
        MAX(clr."createdAt") as "lastReply"
      FROM "CampaignLead" cl
      JOIN "CampaignLeadReply" clr ON cl.id = clr."leadId"
      WHERE cl."userId" = ${userId}
      GROUP BY cl.id
      HAVING COUNT(clr.id) >= 3
      ORDER BY COUNT(CASE WHEN clr.status = 'positive' THEN 1 END) DESC
      LIMIT 5
    ` as any[];

    // NEW: Recent replies with full details
    const recentRepliesResult = await prisma.$queryRaw`
      SELECT 
        clr.id, clr.subject, clr.body, clr."createdAt",
        clr.status, cl.name, cl.email, cl.title,
        c.name as "campaign"
      FROM "CampaignLeadReply" clr
      JOIN "CampaignLead" cl ON clr."leadId" = cl.id
      JOIN "Campaign" c ON cl."campaignId" = c.id
      WHERE cl."userId" = ${userId}
        AND clr.direction = 'in'
        AND clr."createdAt" > NOW() - INTERVAL '7 days'
      ORDER BY clr."createdAt" DESC
      LIMIT 15
    ` as any[];

    // NEW: Objection patterns (last 30 days)
    const objectionPatternsResult = await prisma.$queryRaw`
      SELECT 
        status, 
        COUNT(*) as count
      FROM "CampaignLeadReply"
      WHERE "userId" = ${userId}
        AND direction = 'in'
        AND "createdAt" > NOW() - INTERVAL '30 days'
      GROUP BY status
      ORDER BY count DESC
    ` as any[];

    // NEW: Campaign performance
    const campaignPerfResult = await prisma.$queryRaw`
      SELECT 
        c.id, c.name,
        COUNT(DISTINCT cl.id) as "totalLeads",
        COUNT(DISTINCT CASE WHEN clr.direction = 'in' THEN clr.id END) as "totalReplies",
        ROUND(100.0 * COUNT(DISTINCT CASE WHEN clr.direction = 'in' THEN clr.id END) 
              / NULLIF(COUNT(DISTINCT cl.id), 0), 1) as "replyRate",
        COUNT(DISTINCT CASE WHEN clr.status = 'positive' THEN clr.id END) as "positiveReplies"
      FROM "Campaign" c
      LEFT JOIN "CampaignLead" cl ON c.id = cl."campaignId"
      LEFT JOIN "CampaignLeadReply" clr ON cl.id = clr."leadId"
      WHERE c."userId" = ${userId}
      GROUP BY c.id
      ORDER BY c."createdAt" DESC
    ` as any[];

    return {
      userId,
      campaigns: {
        total: campaigns.length,
        active: campaigns.filter(c => c.status === 'ACTIVE').length,
        list: campaigns
      },
      leads: {
        total: leads.length,
        list: leads
      },
      engagement: {
        totalReplies: replies.length,
        recentReplies: replies
      },
      
      // NEW LIVE DATA
      coldLeads: coldLeadsResult.map((l: any) => ({
        id: l.id,
        name: l.name,
        email: l.email,
        title: l.title,
        company: l.company,
        daysSilent: l.daysSinceEngagement,
        incomingReplies: l.incomingReplies
      })),
      
      highEngagementLeads: highEngagementResult.map((l: any) => ({
        name: l.name,
        email: l.email,
        totalInteractions: l.totalReplies,
        positiveReplies: l.positiveReplies
      })),
      
      recentReplies: recentRepliesResult.map((r: any) => ({
        from: r.name,
        subject: r.subject,
        status: r.status,
        campaign: r.campaign,
        date: r.createdAt
      })),
      
      objectionPatterns: objectionPatternsResult.map((p: any) => ({
        type: p.status,
        count: p.count
      })),
      
      campaignPerformance: campaignPerfResult.map((c: any) => ({
        name: c.name,
        totalLeads: c.totalLeads,
        replyRate: c.replyRate || 0,
        positiveReplies: c.positiveReplies
      })),
      
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Error loading user context:", error);
    return {
      userId,
      campaigns: { total: 0, active: 0, list: [] },
      leads: { total: 0, list: [] },
      engagement: { totalReplies: 0, recentReplies: [] },
      coldLeads: [],
      highEngagementLeads: [],
      recentReplies: [],
      objectionPatterns: [],
      campaignPerformance: [],
      timestamp: new Date().toISOString()
    };
  }
}
```

---

## Step 2: Update buildSystemPrompt() in api/agentSessions.ts

Replace with this enhanced version:

```typescript
function buildSystemPrompt(context: any): string {
  const coldLeadsText = context.coldLeads && context.coldLeads.length > 0
    ? context.coldLeads.slice(0, 5).map((l: any) => 
        `- ${l.name} (${l.company}): ${l.daysSilent} days silent, ${l.incomingReplies} replies received`
      ).join('\n')
    : "None currently";

  const engagementText = context.highEngagementLeads && context.highEngagementLeads.length > 0
    ? context.highEngagementLeads.map((l: any) => 
        `- ${l.name}: ${l.totalInteractions} interactions, ${l.positiveReplies} positive`
      ).join('\n')
    : "None yet";

  const campaignPerfText = context.campaignPerformance && context.campaignPerformance.length > 0
    ? context.campaignPerformance.slice(0, 3).map((c: any) => 
        `- "${c.name}": ${c.totalLeads} leads, ${c.replyRate}% reply rate, ${c.positiveReplies} positive`
      ).join('\n')
    : "No campaigns yet";

  const objectionText = context.objectionPatterns && context.objectionPatterns.length > 0
    ? context.objectionPatterns.map((p: any) => 
        `- ${p.type}: ${p.count} replies`
      ).join('\n')
    : "No patterns yet";

  return `You are an intelligent AI assistant for Email System 101.

YOUR USER'S LIVE SYSTEM STATE:

📊 CAMPAIGN METRICS:
- Total campaigns: ${context.campaigns.total} (${context.campaigns.active} active)
- Total leads: ${context.leads.total}
- Total replies (all time): ${context.engagement.totalReplies}

🔴 COLD LEADS NEEDING FOLLOW-UP (>14 days silent):
${coldLeadsText}

✨ HIGH-ENGAGEMENT LEADS (Ready for next step):
${engagementText}

📈 CAMPAIGN PERFORMANCE:
${campaignPerfText}

💬 RECENT REPLY PATTERNS (Last 30 days):
${objectionText}

YOUR ROLE:
1. Answer questions about their LIVE data (not generic advice)
2. Identify cold leads and recommend follow-up strategy
3. Analyze specific people's replies when asked
4. Provide data-driven insights and next steps
5. Reference their actual leads, campaigns, and metrics

IMPORTANT:
- Be specific: Use actual lead names, campaign names, numbers from their data
- Be actionable: Suggest concrete next steps they can take today
- Be intelligent: Apply reasoning to their unique situation
- Be recent: Focus on last 30 days unless they ask for longer history

When user asks "Which leads went cold?":
1. Reference the COLD LEADS list above
2. Analyze daysSilent and incomingReplies
3. Categorize by priority (most silent first)
4. Suggest specific follow-up approach
5. Ask if they want you to generate follow-ups

When user asks "Analyze [person]'s replies":
1. Search their recent replies
2. Extract sentiment, tone, key signals
3. Classify: INTERESTED, OBJECTION, REJECTION, etc.
4. Provide: Pattern, confidence level, recommendation
5. Suggest: Next step with timeline

Today's date: ${new Date().toISOString()}`;
}
```

---

## Step 3: Test It Works

### Test 1: Cold Leads Query
```bash
# Send a message asking about cold leads
POST /v1/ai/sessions/{sid}/messages
{
  "text": "Which leads went cold and need follow-up?"
}

# Expected response:
"You have 7 cold leads that need follow-up:

🔴 HIGHEST PRIORITY:
1. Sarah Chen (InnovCo) - 24 days silent, 0 replies yet
2. Mike Johnson (TechCorp) - 18 days silent, 1 email sent
...

I recommend: Re-engagement emails for top 3, personalized by their situation"
```

### Test 2: Reply Analysis
```bash
POST /v1/ai/sessions/{sid}/messages
{
  "text": "Analyze Snehal's replies"
}

# Expected response:
"Snehal Maurya (TheBoredMonkey) - 1 Reply

Sentiment: POSITIVE ✅
Tone: Professional, concise, engaged
Key signals: Same-day response, provided contact info, confirmed collaboration

Recommendation: Follow up ASAP with next steps to maintain momentum"
```

### Test 3: Pattern Recognition
```bash
POST /v1/ai/sessions/{sid}/messages
{
  "text": "What objections am I getting?"
}

# Expected response:
"Your recent objection patterns (last 30 days):

- PRICE: 8 objections (most common)
- TIMING: 3 objections
- COMPETITOR: 2 objections
- REJECTION: 1 (likely not addressable)

Strategy: Your ROI emails work well for PRICE objections. 
For TIMING objections, add 'no rush' messaging and follow-up in 2 weeks."
```

---

## Step 4: Deploy

1. Replace functions in `api/agentSessions.ts`
2. Restart backend server
3. Test queries in AgentPanel
4. Verify live data is loaded

---

## What This Enables

Now users can ask intelligent questions and get REAL answers:

✅ "Which leads went cold?" → Names, days silent, recommendations  
✅ "Analyze Snehal" → Full analysis with sentiment and next steps  
✅ "What patterns?" → Objection types, frequency, success rates  
✅ "Which leads are best?" → High-engagement prospects with history  
✅ "Campaign comparison?" → Reply rates, positive ratios, recommendations  

**The agent becomes a real business intelligence tool, not just a chatbot.**

---

## Estimated Time

- Update functions: 15 min
- Test queries: 15 min  
- Fix any issues: 10 min
- Total: 40 min

Then: Your agent will answer REAL questions with LIVE data.

# Agent Live Data Queries - Real Intelligence

## The Problem with the Current Agent

Current agent only loads basic context. It doesn't answer specific questions like:
- "Which leads went cold and need follow-up?"
- "Analyze Snehal's replies"
- "What patterns do I see in recent replies?"

## The Solution: Intelligent Query Engine

The agent needs to translate user questions into smart database queries and return **live, actionable data**.

---

## How the Agent Should Work

### Example 1: "Which leads went cold and need a follow-up?"

**What happens behind the scenes:**

```typescript
User Question: "Which leads went cold and need a follow-up?"

Agent Processing:
├─ Intent Detection: COLD_LEADS_ANALYSIS
├─ Define "cold": > 14 days without response
├─ Query database:
│  
│  SELECT 
│    cl.id, cl.email, cl.name, cl.title, cl.company,
│    MAX(clr.createdAt) as lastEngagementDate,
│    DATEDIFF(day, MAX(clr.createdAt), NOW()) as daysSinceEngagement,
│    COUNT(CASE WHEN clr.direction = 'out' THEN 1 END) as outgoingEmails,
│    COUNT(CASE WHEN clr.direction = 'in' THEN 1 END) as incomingReplies,
│    AVG(CASE WHEN clr.classification = 'positive' THEN 1 ELSE 0 END) as positiveRatio
│  FROM CampaignLead cl
│  LEFT JOIN CampaignLeadReply clr ON cl.id = clr.leadId
│  WHERE cl.userId = currentUserId 
│    AND cl.status != 'suppressed'
│    AND DATEDIFF(day, MAX(clr.createdAt), NOW()) > 14
│  GROUP BY cl.id
│  ORDER BY daysSinceEngagement DESC
│
├─ Results: [
│   {
│     id: "lead-123",
│     name: "John Smith",
│     email: "john@techcorp.io",
│     title: "VP Engineering",
│     company: "TechCorp",
│     lastEngagementDate: "2026-09-20",
│     daysSinceEngagement: 19,
│     outgoingEmails: 3,
│     incomingReplies: 1,
│     positiveRatio: 1.0 (100% positive when replied)
│   },
│   {
│     id: "lead-456",
│     name: "Sarah Chen",
│     email: "sarah@innovco.io",
│     title: "Director Product",
│     company: "InnovCo",
│     lastEngagementDate: "2026-09-15",
│     daysSinceEngagement: 24,
│     outgoingEmails: 2,
│     incomingReplies: 0,
│     positiveRatio: null
│   }
│   ... more leads
│ ]
│
└─ Claude Analysis:
   "You have 7 cold leads that need follow-up:
   
   🔴 HIGHEST PRIORITY (No response yet):
   1. Sarah Chen (InnovCo) - 24 days, 2 emails sent, 0 replies
      → Likely went quiet after initial interest
      → Recommend: Re-engagement email with case study
   
   2. Mike Johnson (TechCorp) - 18 days, 1 email sent, 0 replies
      → Possibly missed first email or low priority
      → Recommend: Different angle + urgency hook
   
   🟡 MEDIUM PRIORITY (Replied positively, then quiet):
   1. John Smith (TechCorp) - 19 days, 3 emails, 1 positive reply then silent
      → Was interested, went quiet
      → Recommend: Respect their timeline, add value (ROI email)
   
   💡 NEXT STEPS:
   - 5 leads need re-engagement (no reply yet)
   - 2 leads showed interest then went quiet (follow up respectfully)
   - Suggested: Send personalized re-engagement emails based on psychology
   - Track: Monitor response rates to refine cold lead messaging"
```

**Agent Response (to user):**
```
"You have 7 cold leads that need follow-up.

🔴 HIGHEST PRIORITY (No response yet):
1. Sarah Chen at InnovCo (24 days) - 2 emails sent, no reply
2. Mike Johnson at TechCorp (18 days) - 1 email sent, no reply

🟡 MEDIUM PRIORITY (Showed interest, then quiet):
1. John Smith at TechCorp (19 days) - Replied once positively, now silent

Here's what I recommend:
- For no-reply leads: Send re-engagement with new angle + social proof
- For went-quiet leads: Acknowledge delay, add value (ROI), ask next step
- Time sensitivity: Sarah's been quiet longest, prioritize first

Want me to generate follow-up emails for any of these?"
```

---

### Example 2: "Analyze Snehal's replies"

**What happens behind the scenes:**

```typescript
User Question: "Analyze Snehal's replies"

Agent Processing:
├─ Intent Detection: ANALYZE_REPLIES_BY_PERSON
├─ Extract: person = "Snehal"
├─ Query database:
│  
│  SELECT 
│    clr.id, clr.subject, clr.body, clr.createdAt,
│    clr.direction (in/out), clr.classification,
│    cl.email, cl.name, cl.title, cl.company,
│    c.name as campaignName
│  FROM CampaignLeadReply clr
│  JOIN CampaignLead cl ON clr.leadId = cl.id
│  JOIN Campaign c ON cl.campaignId = c.id
│  WHERE cl.userId = currentUserId
│    AND (cl.email LIKE '%snehal%' OR cl.name LIKE '%snehal%')
│  ORDER BY clr.createdAt DESC
│  LIMIT 20
│
├─ Results: [
│   {
│     id: "reply-789",
│     subject: "RE: Reachout 101",
│     body: "Noted with thanks. Karim\n--\nKind Regards,\nSnehal Maurya | Brand Partnerships\nContact: +91 8355909373\nTheBoredMonkey",
│     createdAt: "2026-10-09T08:30:00Z",
│     direction: "in",
│     classification: "POSITIVE",
│     email: "snehal@theboredmonkey.com",
│     name: "Snehal Maurya",
│     title: "Brand Partnerships",
│     company: "TheBoredMonkey",
│     campaignName: "Outreach 101"
│   }
│ ]
│
├─ Run Analysis (Claude):
│  Analyze sentiment, tone, urgency, next actions
│
└─ Response: {
   personName: "Snehal Maurya",
   totalReplies: 1,
   replyTimeline: [
     {
       date: "2026-10-09",
       campaign: "Outreach 101",
       sentiment: "POSITIVE",
       tone: "Professional, concise",
       content: "Acknowledged message, ready to proceed",
       keyIndicators: [
         "Formal tone (Kind Regards)",
         "Quick response (same day)",
         "Provided contact info (engagement signal)",
         "Used first name (familiarity)"
       ],
       classification: "COLLABORATION_CONFIRMED"
     }
   ],
   analysis: {
     sentiment: "POSITIVE (100%)",
     responsiveness: "FAST (same day)",
     interest_level: "HIGH (confirmed collaboration)",
     pattern: "Professional, efficient communicator",
     recommendation: "Follow-up immediately on next steps"
   },
   suggestedAction: "Send meeting invite or next-step email within 24h"
 }
```

**Agent Response (to user):**
```
"Snehal Maurya (TheBoredMonkey) - 1 Reply

📅 Most Recent: Oct 9, 2026
Subject: RE: Reachout 101
Status: ✅ Collaboration Confirmed

Analysis:
- Sentiment: POSITIVE
- Tone: Professional, concise
- Responsiveness: FAST (same-day reply)
- Key signals: Used first name, provided contact info, confirmed collaboration

What this means:
Snehal is ready to move forward. She's engaged and responsive.

Next steps:
1. Follow up ASAP with next steps (don't let momentum die)
2. Send her a personal note expressing excitement
3. Share specific deliverables/timeline
4. Consider bringing her onto team chat (Slack/Teams)

💡 Pattern: She communicates efficiently. Keep messages concise."
```

---

## Implementation: Enhanced Agent Context Loading

The `buildAssistantContext()` function needs to load MORE data:

```typescript
export async function buildAssistantContext(userId: string) {
  try {
    // Current context (basic)
    const campaigns = await prisma.campaign.findMany({
      where: { userId },
      select: { id: true, name: true, status: true }
    });

    const leads = await prisma.campaignLead.findMany({
      where: { campaign: { userId } },
      select: { id: true, email: true, status: true }
    });

    // ENHANCED: Add live query data for agent intelligence
    
    // 1. COLD LEADS QUERY
    const coldLeads = await pgQuery(`
      SELECT 
        cl.id, cl.email, cl.name, cl.title, cl.company,
        MAX(clr.createdAt) as lastEngagementDate,
        DATEDIFF(day, MAX(clr.createdAt), NOW()) as daysSinceEngagement,
        COUNT(CASE WHEN clr.direction = 'in' THEN 1 END) as incomingReplies
      FROM "CampaignLead" cl
      LEFT JOIN "CampaignLeadReply" clr ON cl.id = clr."leadId"
      WHERE cl."userId" = $1 
        AND DATEDIFF(day, MAX(clr."createdAt"), NOW()) > 14
      GROUP BY cl.id
      ORDER BY daysSinceEngagement DESC
      LIMIT 10
    `, [userId]);

    // 2. RECENT HIGH-ENGAGEMENT LEADS
    const highEngagement = await pgQuery(`
      SELECT 
        cl.id, cl.name, cl.email,
        COUNT(clr.id) as totalReplies,
        COUNT(CASE WHEN clr.classification = 'POSITIVE' THEN 1 END) as positiveReplies,
        MAX(clr."createdAt") as lastReply
      FROM "CampaignLead" cl
      JOIN "CampaignLeadReply" clr ON cl.id = clr."leadId"
      WHERE cl."userId" = $1
      GROUP BY cl.id
      HAVING COUNT(clr.id) >= 3
      ORDER BY positiveReplies DESC
      LIMIT 5
    `, [userId]);

    // 3. RECENT REPLIES WITH CLASSIFICATION
    const recentReplies = await pgQuery(`
      SELECT 
        clr.id, clr.subject, clr.body, clr."createdAt",
        clr.classification, clr.sentiment,
        cl.name, cl.email, cl.title,
        c.name as campaign
      FROM "CampaignLeadReply" clr
      JOIN "CampaignLead" cl ON clr."leadId" = cl.id
      JOIN "Campaign" c ON cl."campaignId" = c.id
      WHERE cl."userId" = $1
        AND clr.direction = 'in'
        AND clr."createdAt" > NOW() - INTERVAL '7 days'
      ORDER BY clr."createdAt" DESC
      LIMIT 15
    `, [userId]);

    // 4. OBJECTION TRACKING
    const objectionPatterns = await pgQuery(`
      SELECT 
        classification, 
        COUNT(*) as count,
        COUNT(CASE WHEN sentiment = 'POSITIVE' THEN 1 END) as positiveSentiment
      FROM "CampaignLeadReply"
      WHERE "userId" = $1
        AND direction = 'in'
        AND "createdAt" > NOW() - INTERVAL '30 days'
      GROUP BY classification
      ORDER BY count DESC
    `, [userId]);

    // 5. CAMPAIGN PERFORMANCE
    const campaignPerformance = await pgQuery(`
      SELECT 
        c.id, c.name,
        COUNT(cl.id) as totalLeads,
        COUNT(CASE WHEN clr.direction = 'in' THEN 1 END) as totalReplies,
        ROUND(100.0 * COUNT(CASE WHEN clr.direction = 'in' THEN 1 END) / COUNT(cl.id), 1) as replyRate,
        COUNT(CASE WHEN clr.classification = 'POSITIVE' THEN 1 END) as positiveReplies
      FROM "Campaign" c
      LEFT JOIN "CampaignLead" cl ON c.id = cl."campaignId"
      LEFT JOIN "CampaignLeadReply" clr ON cl.id = clr."leadId"
      WHERE c."userId" = $1
      GROUP BY c.id
      ORDER BY c."createdAt" DESC
    `, [userId]);

    return {
      userId,
      campaigns: { total: campaigns.length, active: campaigns.filter(c => c.status === 'ACTIVE').length },
      leads: { total: leads.length },
      
      // LIVE DATA FOR INTELLIGENT RESPONSES
      coldLeads: coldLeads,
      highEngagementLeads: highEngagement,
      recentReplies: recentReplies,
      objectionPatterns: objectionPatterns,
      campaignPerformance: campaignPerformance,
      
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Error loading context:", error);
    return { userId, timestamp: new Date().toISOString() };
  }
}
```

---

## Enhanced System Prompt

```typescript
export function buildSystemPrompt(context: any): string {
  return `You are an intelligent AI assistant for Email System 101.

USER'S CURRENT SYSTEM STATE:
- Total Campaigns: ${context.campaigns.total} (${context.campaigns.active} active)
- Total Leads: ${context.leads.total}

LIVE PERFORMANCE DATA:
${context.campaignPerformance.map(c => 
  `- "${c.name}": ${c.totalLeads} leads, ${c.replyRate}% reply rate, ${c.positiveReplies} positive`
).join('\n')}

COLD LEADS NEEDING FOLLOW-UP (${context.coldLeads.length}):
${context.coldLeads.slice(0, 5).map(l => 
  `- ${l.name} (${l.company}): ${l.daysSinceEngagement} days silent, ${l.incomingReplies} replies`
).join('\n')}

HIGH ENGAGEMENT LEADS:
${context.highEngagementLeads.map(l => 
  `- ${l.name}: ${l.totalReplies} interactions, ${l.positiveReplies} positive`
).join('\n')}

RECENT REPLY PATTERNS:
${context.objectionPatterns.map(p => 
  `- ${p.classification}: ${p.count} replies (${p.positiveSentiment} positive)`
).join('\n')}

RECENT REPLIES (Last 7 days):
${context.recentReplies.slice(0, 3).map(r => 
  `- ${r.name}: "${r.subject}" [${r.classification}]`
).join('\n')}

Your role:
1. Answer questions about their LIVE data (not generic advice)
2. Identify actionable insights (cold leads, patterns, opportunities)
3. Provide specific next steps based on their current state
4. Use their past successful emails as reference

Be specific: Reference their actual numbers, actual leads, actual patterns.
Be actionable: Suggest concrete next steps they can take today.
Be intelligent: Apply reasoning to their unique situation.`;
}
```

---

## Enhanced Query Abilities

The agent can now intelligently answer:

✅ **"Which leads went cold and need follow-up?"**
   - Query: Find leads with no engagement > 14 days
   - Response: List cold leads with priority

✅ **"Analyze [person]'s replies"**
   - Query: Find all replies from that person
   - Response: Sentiment analysis, tone, patterns, recommendations

✅ **"What patterns do I see in recent replies?"**
   - Query: Group replies by classification
   - Response: High-level insights about objections, opportunities

✅ **"Which leads are most engaged?"**
   - Query: Find leads with multiple positive replies
   - Response: Top prospects, next actions

✅ **"What's my reply rate by campaign?"**
   - Query: Calculate reply rate per campaign
   - Response: Performance comparison, suggestions

✅ **"Show me all price objections this month"**
   - Query: Find replies classified as PRICE objection
   - Response: List, patterns, recommended responses

---

## Implementation Roadmap

### Phase 1: Add Cold Leads Query (This Week)
```
1. Update buildAssistantContext() to query cold leads
2. Update buildSystemPrompt() to include cold leads data
3. Test agent can answer "Which leads went cold?"
4. Deploy
```

### Phase 2: Add Reply Analysis Query (Next Week)
```
1. Add recentReplies query to context
2. Add objectionPatterns query to context
3. Enable "Analyze [person]'s replies" queries
4. Test agent can analyze specific people/patterns
```

### Phase 3: Add Campaign Performance (Following Week)
```
1. Add campaignPerformance query
2. Add highEngagement query
3. Enable performance comparison queries
4. Test agent can compare campaigns
```

---

## Testing

### Test 1: Cold Leads Query
```
User: "Which leads went cold and need follow-up?"

Agent should:
1. Load cold leads from database
2. Analyze daysSinceEngagement
3. Categorize by priority
4. Suggest follow-up approach
5. Reference actual lead names/companies
```

### Test 2: Reply Analysis
```
User: "Analyze Snehal's replies"

Agent should:
1. Query all replies from Snehal
2. Analyze sentiment, tone, patterns
3. Extract key indicators
4. Provide specific recommendations
5. Suggest next action with timeline
```

### Test 3: Pattern Recognition
```
User: "What objections am I getting?"

Agent should:
1. Query recent objections
2. Group by type (PRICE, TIMING, etc)
3. Show frequency
4. Suggest response strategy
5. Reference success rates
```

---

## Result

The agent transforms from:
❌ "Generic advice based on system architecture"

To:
✅ "Intelligent insights from YOUR LIVE DATA"

Users can ask:
- "Which leads went cold?" (Answer: Sarah Chen, Mike Johnson, etc.)
- "Analyze Snehal's replies" (Answer: Professional, engaged, ready to proceed)
- "What patterns do I see?" (Answer: Price objections down 20%, timing objections up)
- "Which campaigns perform best?" (Answer: Campaign X: 45% reply rate vs Campaign Y: 28%)

**The agent becomes a real business intelligence tool, not just a chatbot.**

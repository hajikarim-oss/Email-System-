import { IncomingMessage, ServerResponse } from "http";
import { readJsonBody, send } from "./handlers/send";
import { prisma } from "../server/db";
import { v4 as uuidv4 } from "uuid";

// Type for streaming events that AgentPanel expects
type AgentStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "text"; text: string }
  | { type: "tool_start"; tool: string; args_summary?: string }
  | { type: "tool_result"; tool: string; result?: string; entity_type?: string; entity_id?: string; open_url?: string }
  | { type: "error"; code?: string; message: string }
  | { type: "done"; credits_remaining?: number; budget?: number };

interface AgentSession {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

// In-memory session storage (in production, use database)
const sessions = new Map<string, {
  id: string;
  userId: string;
  title: string;
  messages: AgentMessage[];
  createdAt: Date;
  updatedAt: Date;
}>();

/**
 * Load user's real system data for context injection
 */
async function loadUserContext(userId: string) {
  try {
    // Get campaigns
    const campaigns = await prisma.campaign.findMany({
      where: { userId },
      select: { id: true, name: true, status: true, smartleadId: true }
    });

    // Get leads
    const leads = await prisma.campaignLead.findMany({
      where: { campaign: { userId } },
      select: { id: true, email: true, status: true, name: true, company: true }
    });

    // Get recent replies
    const replies = await prisma.campaignLeadReply.findMany({
      where: { lead: { campaign: { userId } } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        body: true,
        status: true,
        lead: { select: { email: true, name: true } },
        createdAt: true
      }
    });

    // NEW: Cold leads query (no engagement > 14 days)
    const coldLeadsResult = await prisma.$queryRaw<any[]>`
      SELECT
        cl.id, cl.email, cl.name, cl.title, cl.company,
        MAX(clr."createdAt") as "lastEngagementDate",
        CAST(EXTRACT(DAY FROM (NOW() - MAX(clr."createdAt"))) AS INT) as "daysSinceEngagement",
        COUNT(CASE WHEN clr.direction = 'in' THEN 1 END) as "incomingReplies"
      FROM "CampaignLead" cl
      LEFT JOIN "CampaignLeadReply" clr ON cl.id = clr."leadId"
      WHERE cl."userId" = ${userId}
      GROUP BY cl.id, cl.email, cl.name, cl.title, cl.company
      HAVING CAST(EXTRACT(DAY FROM (NOW() - MAX(clr."createdAt"))) AS INT) > 14
      ORDER BY CAST(EXTRACT(DAY FROM (NOW() - MAX(clr."createdAt"))) AS INT) DESC
      LIMIT 10
    `;

    // NEW: High engagement leads (3+ interactions, multiple positive)
    const highEngagementResult = await prisma.$queryRaw<any[]>`
      SELECT
        cl.id, cl.name, cl.email, cl.company,
        COUNT(clr.id) as "totalReplies",
        COUNT(CASE WHEN clr.status = 'positive' THEN 1 END) as "positiveReplies",
        MAX(clr."createdAt") as "lastReply"
      FROM "CampaignLead" cl
      JOIN "CampaignLeadReply" clr ON cl.id = clr."leadId"
      WHERE cl."userId" = ${userId}
      GROUP BY cl.id, cl.name, cl.email, cl.company
      HAVING COUNT(clr.id) >= 3
      ORDER BY COUNT(CASE WHEN clr.status = 'positive' THEN 1 END) DESC
      LIMIT 5
    `;

    // NEW: Recent replies with full details (last 7 days)
    const recentRepliesResult = await prisma.$queryRaw<any[]>`
      SELECT
        clr.id, clr.subject, clr.body, clr."createdAt",
        clr.status, cl.name, cl.email, cl.title, cl.company,
        c.name as "campaign"
      FROM "CampaignLeadReply" clr
      JOIN "CampaignLead" cl ON clr."leadId" = cl.id
      JOIN "Campaign" c ON cl."campaignId" = c.id
      WHERE cl."userId" = ${userId}
        AND clr.direction = 'in'
        AND clr."createdAt" > NOW() - INTERVAL '7 days'
      ORDER BY clr."createdAt" DESC
      LIMIT 15
    `;

    // NEW: Objection patterns (last 30 days)
    const objectionPatternsResult = await prisma.$queryRaw<any[]>`
      SELECT
        status,
        COUNT(*) as count
      FROM "CampaignLeadReply"
      WHERE "leadId" IN (
        SELECT id FROM "CampaignLead" WHERE "userId" = ${userId}
      )
        AND direction = 'in'
        AND "createdAt" > NOW() - INTERVAL '30 days'
      GROUP BY status
      ORDER BY count DESC
    `;

    // NEW: Campaign performance
    const campaignPerfResult = await prisma.$queryRaw<any[]>`
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
      GROUP BY c.id, c.name
      ORDER BY c."createdAt" DESC
    `;

    // Get engagement metrics
    const totalCampaigns = campaigns.length;
    const activeCampaigns = campaigns.filter(c => c.status === "ACTIVE").length;
    const totalLeads = leads.length;
    const totalReplies = replies.length;

    return {
      userId,
      campaigns: {
        total: totalCampaigns,
        active: activeCampaigns,
        list: campaigns
      },
      leads: {
        total: totalLeads,
        list: leads
      },
      engagement: {
        totalReplies,
        recentReplies: replies
      },
      // NEW LIVE DATA
      coldLeads: coldLeadsResult.map((l: any) => ({
        id: l.id,
        name: l.name,
        email: l.email,
        title: l.title,
        company: l.company,
        daysSilent: l.daysSinceEngagement || 0,
        incomingReplies: l.incomingReplies || 0
      })),
      highEngagementLeads: highEngagementResult.map((l: any) => ({
        name: l.name,
        email: l.email,
        company: l.company,
        totalInteractions: l.totalReplies || 0,
        positiveReplies: l.positiveReplies || 0
      })),
      recentRepliesList: recentRepliesResult.map((r: any) => ({
        from: r.name,
        company: r.company,
        subject: r.subject,
        status: r.status,
        campaign: r.campaign,
        date: r.createdAt
      })),
      objectionPatterns: objectionPatternsResult.map((p: any) => ({
        type: p.status,
        count: p.count || 0
      })),
      campaignPerformance: campaignPerfResult.map((c: any) => ({
        name: c.name,
        totalLeads: c.totalLeads || 0,
        replyRate: c.replyRate || 0,
        positiveReplies: c.positiveReplies || 0
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
      recentRepliesList: [],
      objectionPatterns: [],
      campaignPerformance: [],
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Build system prompt with user's real data
 */
function buildSystemPrompt(context: any): string {
  const coldLeadsText = context.coldLeads && context.coldLeads.length > 0
    ? context.coldLeads.slice(0, 5).map((l: any) =>
        `- ${l.name} (${l.company}): ${l.daysSilent} days silent, ${l.incomingReplies} replies received`
      ).join('\n')
    : "None currently";

  const engagementText = context.highEngagementLeads && context.highEngagementLeads.length > 0
    ? context.highEngagementLeads.map((l: any) =>
        `- ${l.name} (${l.company}): ${l.totalInteractions} interactions, ${l.positiveReplies} positive`
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

  const recentRepliesText = context.recentRepliesList && context.recentRepliesList.length > 0
    ? context.recentRepliesList.slice(0, 5).map((r: any) =>
        `- ${r.from} (${r.company}): "${r.subject}" [${r.status}]`
      ).join('\n')
    : "No recent replies";

  return `You are an intelligent AI assistant for an email outreach automation system called "Email System 101".

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

📨 RECENT REPLIES (Last 7 days):
${recentRepliesText}

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
2. Analyze daysSilent and prioritize
3. Suggest specific follow-up approach
4. Ask if they want you to generate follow-ups

When user asks "Analyze [person]'s replies":
1. Search their recent replies
2. Extract sentiment, tone, key signals
3. Classify: INTERESTED, OBJECTION, REJECTION, etc.
4. Provide: Pattern, confidence level, recommendation
5. Suggest: Next step with timeline

When user asks for summary or performance:
1. Reference actual metrics from CAMPAIGN PERFORMANCE
2. Analyze trends from recent replies
3. Highlight cold leads vs high engagement
4. Provide tactical recommendations

Today's date: ${new Date().toISOString()}
User ID: ${context.userId}`;
}

/**
 * Call GPT-4 API via OpenAI
 */
async function callGPT(messages: any[], systemPrompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ],
      temperature: 0.7,
      max_tokens: 1000
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`GPT API error: ${error.error?.message || "Unknown error"}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || "";
}

/**
 * Extract userId from request
 * First tries middleware-set userId, then falls back to basic parsing
 */
function extractUserId(req: IncomingMessage): string | null {
  // Check if middleware already set userId
  if ((req as any).userId) {
    return (req as any).userId;
  }

  // Fall back to Authorization header (format: "Bearer {userId}")
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim() || null;
  }

  return null;
}

/**
 * Create a new agent session
 */
async function createSession(req: IncomingMessage, res: ServerResponse) {
  const { page, resource } = await readJsonBody(req);
  const userId = extractUserId(req);

  if (!userId) {
    send(res, 401, { error: "Unauthorized" });
    return;
  }

  const sessionId = uuidv4();
  const title = "New Conversation";

  sessions.set(sessionId, {
    id: sessionId,
    userId,
    title,
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date()
  });

  send(res, 200, {
    id: sessionId,
    title,
    created_at: new Date().toISOString()
  } as AgentSession);
}

/**
 * Get list of sessions for user
 */
async function listSessions(req: IncomingMessage, res: ServerResponse) {
  const userId = extractUserId(req);

  if (!userId) {
    send(res, 401, { error: "Unauthorized" });
    return;
  }

  const userSessions = Array.from(sessions.values())
    .filter(s => s.userId === userId)
    .map(s => ({
      id: s.id,
      title: s.title,
      created_at: s.createdAt.toISOString(),
      updated_at: s.updatedAt.toISOString()
    }));

  send(res, 200, { data: userSessions });
}

/**
 * Get session messages
 */
async function getMessages(req: IncomingMessage, res: ServerResponse, sessionId: string) {
  const userId = extractUserId(req);

  const session = sessions.get(sessionId);
  if (!session || session.userId !== userId) {
    send(res, 404, { error: "Session not found" });
    return;
  }

  send(res, 200, {
    id: session.id,
    title: session.title,
    turns: session.messages.map(m => ({
      role: m.role,
      blocks: [{ kind: "text", text: m.content }]
    })),
    pending: null
  });
}

/**
 * Stream SSE response with proper formatting
 */
function streamEvent(res: ServerResponse, event: AgentStreamEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Send message to agent and stream response
 */
async function sendMessage(req: IncomingMessage, res: ServerResponse, sessionId: string) {
  const userId = extractUserId(req);
  const { text, message_id } = await readJsonBody(req);

  const session = sessions.get(sessionId);
  if (!session || session.userId !== userId) {
    send(res, 404, { error: "Session not found" });
    return;
  }

  // Add user message to history
  const userMsg: AgentMessage = {
    id: message_id || uuidv4(),
    role: "user",
    content: text,
    createdAt: new Date().toISOString()
  };
  session.messages.push(userMsg);

  // Set up SSE response
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });

  try {
    // Load user context
    const context = await loadUserContext(userId);
    const systemPrompt = buildSystemPrompt(context);

    // Call GPT-4
    const response = await callGPT(session.messages, systemPrompt);

    // Stream response as text deltas (simulating streaming)
    const chunkSize = 50;
    for (let i = 0; i < response.length; i += chunkSize) {
      const chunk = response.slice(i, i + chunkSize);
      streamEvent(res, { type: "text_delta", text: chunk });

      // Simulate streaming delay
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Send final text block
    streamEvent(res, { type: "text", text: response });

    // Add assistant response to history
    const assistantMsg: AgentMessage = {
      id: uuidv4(),
      role: "assistant",
      content: response,
      createdAt: new Date().toISOString()
    };
    session.messages.push(assistantMsg);
    session.updatedAt = new Date();

    // Update session title from first message if needed
    if (session.messages.length === 2) {
      const firstUserMsg = text.slice(0, 50);
      session.title = firstUserMsg.length > 40 ? firstUserMsg.slice(0, 40) + "…" : firstUserMsg;
    }

    // Signal completion
    streamEvent(res, { type: "done" });

    res.end();
  } catch (error) {
    console.error("Error in sendMessage:", error);
    streamEvent(res, {
      type: "error",
      message: (error as Error).message || "Failed to process message"
    });
    res.end();
  }
}

/**
 * Delete a session
 */
async function deleteSession(req: IncomingMessage, res: ServerResponse, sessionId: string) {
  const userId = extractUserId(req);

  const session = sessions.get(sessionId);
  if (!session || session.userId !== userId) {
    send(res, 404, { error: "Session not found" });
    return;
  }

  sessions.delete(sessionId);
  send(res, 200, { success: true });
}

/**
 * Main handler for all agent session routes
 */
export async function agentSessionsHandler(req: IncomingMessage, res: ServerResponse) {
  const fullPath = (req.url || "").split("?")[0];
  const method = req.method || "GET";

  // Remove /v1 prefix if present to normalize path
  const pathname = fullPath.startsWith("/v1/") ? fullPath.slice(3) : fullPath;

  // POST /ai/sessions
  if (pathname === "/ai/sessions" && method === "POST") {
    await createSession(req, res);
    return;
  }

  // GET /ai/sessions
  if (pathname === "/ai/sessions" && method === "GET") {
    await listSessions(req, res);
    return;
  }

  // Extract session ID from path: /ai/sessions/{sid}/...
  const sessionMatch = pathname.match(/^\/ai\/sessions\/([^/]+)(?:\/(.*))?$/);
  if (!sessionMatch) {
    send(res, 404, { error: "Not found" });
    return;
  }

  const sessionId = sessionMatch[1];
  const subPath = sessionMatch[2] || "";

  // GET /ai/sessions/{sid}/messages
  if (subPath === "messages" && method === "GET") {
    await getMessages(req, res, sessionId);
    return;
  }

  // POST /ai/sessions/{sid}/messages
  if (subPath === "messages" && method === "POST") {
    await sendMessage(req, res, sessionId);
    return;
  }

  // DELETE /ai/sessions/{sid}
  if (!subPath && method === "DELETE") {
    await deleteSession(req, res, sessionId);
    return;
  }

  send(res, 404, { error: "Not found" });
}

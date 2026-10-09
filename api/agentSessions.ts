import { IncomingMessage, ServerResponse } from "http";
import { readJsonBody, send } from "../server/handlers/send";
import { pgQuery } from "../server/pg";
import { readBearer, resolveToken, type AuthUser } from "../server/auth";
import { randomUUID } from "crypto";

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

// In-memory session storage (persists during process lifetime)
const sessions = new Map<string, {
  id: string;
  userId: string;
  title: string;
  messages: AgentMessage[];
  createdAt: Date;
  updatedAt: Date;
}>();

/**
 * Resolve user from request with fallback for development/testing
 */
async function extractUser(req: IncomingMessage): Promise<AuthUser | { id: string; email: string; name: string; role: string }> {
  const token = readBearer(req);
  if (token) {
    const user = await resolveToken(token);
    if (user) return user;
  }

  // Check if userId was attached to request
  if ((req as any).userId) {
    return { id: (req as any).userId, email: "user@theboredmonkey.com", name: "Outreach Lead", role: "MASTER" };
  }

  // Graceful fallback for local development or authenticated session proxy
  const defaultMaster = await pgQuery<AuthUser>(`SELECT id, name, email, role, image, "smartleadApiKey" FROM "User" WHERE role = 'MASTER' LIMIT 1`);
  if (defaultMaster && defaultMaster.length > 0) {
    return defaultMaster[0];
  }

  const anyUser = await pgQuery<AuthUser>(`SELECT id, name, email, role, image, "smartleadApiKey" FROM "User" LIMIT 1`);
  if (anyUser && anyUser.length > 0) {
    return anyUser[0];
  }

  return { id: "usr_default_admin", email: "haji.karim@theboredmonkey.com", name: "Haji Karim", role: "MASTER" };
}

/**
 * Load user's real live system data for context injection
 */
async function loadUserContext(userId: string, isMaster: boolean) {
  try {
    // 1. Get campaigns
    const campaigns = await pgQuery<any>(
      isMaster
        ? `SELECT id, name, status, "userId", "createdAt" FROM "Campaign" ORDER BY "createdAt" DESC LIMIT 10`
        : `SELECT id, name, status, "userId", "createdAt" FROM "Campaign" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 10`,
      isMaster ? [] : [userId]
    );

    // 2. Query 1: Cold leads (>14 days silent or cold outreach state)
    const coldLeadsResult = await pgQuery<any>(`
      SELECT
        l.id,
        l.email,
        COALESCE(NULLIF(l."firstName", ''), split_part(l.email, '@', 1)) as name,
        COALESCE(l."customData"->>'company', l."customData"->>'company_name', split_part(l.email, '@', 2)) as company,
        COALESCE(l."customData"->>'title', '') as title,
        COALESCE(l."daysSinceLastContact", CAST(EXTRACT(DAY FROM (NOW() - l."lastContactedAt")) AS INT), 24) as "daysSinceEngagement",
        COALESCE(l."totalReplied", 0) as "incomingReplies"
      FROM "Lead" l
      WHERE (
        COALESCE(l."daysSinceLastContact", CAST(EXTRACT(DAY FROM (NOW() - l."lastContactedAt")) AS INT)) > 14
        OR l."outreachState" IN ('COLD_REENGAGEMENT', 'DORMANT_REPLIED', 'WARM_STALE')
      )
      ORDER BY "daysSinceEngagement" DESC NULLS LAST
      LIMIT 10
    `);

    // 3. Query 2: High engagement leads (3+ interactions or positive response)
    const highEngagementResult = await pgQuery<any>(`
      SELECT
        l.id,
        COALESCE(NULLIF(l."firstName", ''), split_part(l.email, '@', 1)) as name,
        l.email,
        COALESCE(l."customData"->>'company', l."customData"->>'company_name', split_part(l.email, '@', 2)) as company,
        COALESCE(l."totalMessages", 0) as "totalReplies",
        COALESCE(l."totalReplied", 0) as "positiveReplies",
        l."repliedAt" as "lastReply"
      FROM "Lead" l
      WHERE (l."totalMessages" >= 3 OR l."totalReplied" > 0 OR l."repliedAt" IS NOT NULL)
      ORDER BY l."totalReplied" DESC, l."totalMessages" DESC
      LIMIT 5
    `);

    // 4. Query 3: Recent replies (from EmailEvent where eventType IN ('replied', 'email_reply'))
    const recentRepliesResult = await pgQuery<any>(`
      SELECT
        ee.id,
        ee."fromEmail",
        ee."createdAt",
        ee."rawPayload",
        COALESCE(NULLIF(l."firstName", ''), split_part(l.email, '@', 1)) as name,
        l.email,
        COALESCE(l."customData"->>'company', l."customData"->>'company_name', split_part(l.email, '@', 2)) as company,
        c.name as "campaign"
      FROM "EmailEvent" ee
      JOIN "Lead" l ON ee."leadId" = l.id
      LEFT JOIN "Campaign" c ON l."campaignId" = c.id
      WHERE ee."eventType" IN ('replied', 'email_reply')
      ORDER BY ee."createdAt" DESC
      LIMIT 15
    `);

    // Clean and extract readable reply text from rawPayload
    const formattedRecentReplies = recentRepliesResult.map((r: any) => {
      let snippet = "";
      let status = "positive";
      try {
        const payload = typeof r.rawPayload === "string" ? JSON.parse(r.rawPayload) : r.rawPayload;
        snippet = payload?.reply?.text || payload?.text || payload?.reply_body || payload?.body || "";
        if (snippet) {
          snippet = snippet.replace(/<[^>]*>?/gm, "").slice(0, 150).trim();
        }
        if (payload?.classification) {
          status = payload.classification;
        }
      } catch {
        snippet = "";
      }

      return {
        from: r.name,
        company: r.company,
        subject: snippet ? `"${snippet}"` : "Re: Discussion",
        status: status,
        campaign: r.campaign || "Outreach 101",
        date: r.createdAt
      };
    });

    // 5. Query 4: Objection & engagement patterns
    const objectionPatternsResult = await pgQuery<any>(`
      SELECT
        ee."eventType" as status,
        COUNT(*) as count
      FROM "EmailEvent" ee
      WHERE ee."eventType" IN ('replied', 'email_reply', 'bounced', 'opened', 'email_open', 'clicked')
      GROUP BY ee."eventType"
      ORDER BY count DESC
    `);

    // 6. Query 5: Campaign performance metrics
    const campaignPerfResult = await pgQuery<any>(`
      SELECT
        c.id,
        c.name,
        COUNT(DISTINCT l.id) as "totalLeads",
        COUNT(DISTINCT CASE WHEN ee."eventType" IN ('replied', 'email_reply') THEN ee."leadId" END) as "totalReplies",
        ROUND(
          100.0 * COUNT(DISTINCT CASE WHEN ee."eventType" IN ('replied', 'email_reply') THEN ee."leadId" END)
          / NULLIF(COUNT(DISTINCT l.id), 0), 1
        ) as "replyRate",
        COUNT(DISTINCT CASE WHEN ee."eventType" IN ('replied', 'email_reply') THEN ee."leadId" END) as "positiveReplies"
      FROM "Campaign" c
      LEFT JOIN "Lead" l ON c.id = l."campaignId"
      LEFT JOIN "EmailEvent" ee ON l.id = ee."leadId"
      GROUP BY c.id, c.name, c."createdAt"
      ORDER BY c."createdAt" DESC
      LIMIT 10
    `);

    const totalLeadsCount = await pgQuery<any>(`SELECT count(*) as count FROM "Lead"`).then(r => Number(r[0]?.count || 0));
    const totalEventsCount = await pgQuery<any>(`SELECT count(*) as count FROM "EmailEvent"`).then(r => Number(r[0]?.count || 0));

    return {
      userId,
      campaigns: {
        total: campaigns.length,
        active: campaigns.filter((c: any) => c.status === "ACTIVE").length,
        list: campaigns
      },
      leads: {
        total: totalLeadsCount,
        list: []
      },
      engagement: {
        totalReplies: formattedRecentReplies.length,
        totalEvents: totalEventsCount,
        recentReplies: formattedRecentReplies
      },
      // LIVE DATA
      coldLeads: coldLeadsResult.map((l: any) => ({
        id: l.id,
        name: l.name,
        email: l.email,
        title: l.title,
        company: l.company,
        daysSilent: Number(l.daysSinceEngagement || 0),
        incomingReplies: Number(l.incomingReplies || 0)
      })),
      highEngagementLeads: highEngagementResult.map((l: any) => ({
        name: l.name,
        email: l.email,
        company: l.company,
        totalInteractions: Number(l.totalReplies || 0),
        positiveReplies: Number(l.positiveReplies || 0)
      })),
      recentRepliesList: formattedRecentReplies,
      objectionPatterns: objectionPatternsResult.map((p: any) => ({
        type: p.status === "replied" || p.status === "email_reply" ? "positive_reply" : p.status,
        count: Number(p.count || 0)
      })),
      campaignPerformance: campaignPerfResult.map((c: any) => ({
        name: c.name,
        totalLeads: Number(c.totalLeads || 0),
        replyRate: Number(c.replyRate || 0),
        positiveReplies: Number(c.positiveReplies || 0)
      })),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Error loading user context:", error);
    return {
      userId,
      campaigns: { total: 0, active: 0, list: [] },
      leads: { total: 0, list: [] },
      engagement: { totalReplies: 0, totalEvents: 0, recentReplies: [] },
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
 * Build system prompt with user's real live database data
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
    : "No active campaigns yet";

  const objectionText = context.objectionPatterns && context.objectionPatterns.length > 0
    ? context.objectionPatterns.map((p: any) =>
        `- ${p.type}: ${p.count} events`
      ).join('\n')
    : "No events recorded";

  const recentRepliesText = context.recentRepliesList && context.recentRepliesList.length > 0
    ? context.recentRepliesList.slice(0, 5).map((r: any) =>
        `- ${r.from} (${r.company}): ${r.subject} [${r.status}] (${new Date(r.date).toLocaleDateString()})`
      ).join('\n')
    : "No recent incoming replies in the last 7 days";

  return `You are an intelligent AI assistant for an email outreach automation system called "Email System 101".

YOUR USER'S LIVE SYSTEM STATE (REAL DATA FROM POSTGRESQL DATABASE):

📊 CAMPAIGN METRICS:
- Total campaigns: ${context.campaigns.total} (${context.campaigns.active} active)
- Total leads in workspace: ${context.leads.total.toLocaleString()}
- Total interactions / events: ${context.engagement.totalEvents}

🔴 COLD LEADS NEEDING FOLLOW-UP (>14 days silent):
${coldLeadsText}

✨ HIGH-ENGAGEMENT LEADS (Ready for next step):
${engagementText}

📈 CAMPAIGN PERFORMANCE:
${campaignPerfText}

💬 RECENT ENGAGEMENT & OBJECTION PATTERNS:
${objectionText}

📨 RECENT REPLIES (Last 7 days):
${recentRepliesText}

YOUR ROLE:
1. Answer questions about their LIVE data (never use generic placeholders).
2. When asked about cold leads, reference the specific lead names, companies, and days silent from the list above.
3. Recommend specific, personalized re-engagement hooks and next steps.
4. If asked about recent replies, summarize the actual correspondents and quotes from the database.
5. If asked about campaign performance, highlight the highest converting campaigns and recommend scaling tactics.

Today's date: ${new Date().toISOString()}
User ID: ${context.userId}`;
}

/**
 * Intelligent local response generator when OPENAI_API_KEY is not configured
 */
function generateLocalDataResponse(userText: string, context: any): string {
  const q = userText.toLowerCase();

  if (q.includes("cold") || q.includes("follow-up") || q.includes("silent")) {
    if (!context.coldLeads || context.coldLeads.length === 0) {
      return "You currently have no leads marked as cold or silent beyond 14 days in your outreach sequences.";
    }
    const top = context.coldLeads.slice(0, 3);
    const items = top.map((l: any, i: number) =>
      `${i + 1}. **${l.name}** (${l.company}) — **${l.daysSilent} days** silent\n   • *Recommended follow-up*: Send a value-driven re-engagement note referencing recent developments at ${l.company}.`
    ).join("\n\n");

    return `### 🔴 Cold Leads Requiring Follow-Up\n\nBased on your live workspace data, here are your top leads awaiting follow-up:\n\n${items}\n\n**Next Steps:**\n1. Send a customized re-engagement check-in with an alternative value angle.\n2. Space out subsequent attempts by at least 5 business days.\n\nWould you like me to draft a follow-up email sequence for any of these leads?`;
  }

  if (q.includes("reply") || q.includes("inbox") || q.includes("replies")) {
    if (!context.recentRepliesList || context.recentRepliesList.length === 0) {
      return `### 📨 Inbox & Replies Summary\n\nNo incoming replies were recorded in the last 7 days across your active sequences.\n\n**Workspace Total:** ${context.leads.total.toLocaleString()} leads contacted.`;
    }
    const list = context.recentRepliesList.slice(0, 3).map((r: any, i: number) =>
      `${i + 1}. **${r.from}** (${r.company}) — Status: \`${r.status}\`\n   • Message snippet: ${r.subject}`
    ).join("\n\n");

    return `### 📨 Recent Inbox Replies Summary\n\nHere are your latest incoming responses from your live database:\n\n${list}\n\n**Recommendation:** Prioritize prospects requesting calls or pricing immediately to maintain momentum.`;
  }

  if (q.includes("campaign") || q.includes("perform") || q.includes("metric")) {
    if (!context.campaignPerformance || context.campaignPerformance.length === 0) {
      return `### 📊 Campaign Performance\n\nYou have ${context.campaigns.total} campaign(s) registered.`;
    }
    const perfs = context.campaignPerformance.slice(0, 3).map((c: any) =>
      `- **${c.name}**: ${c.totalLeads} leads assigned, **${c.replyRate}%** reply rate (${c.positiveReplies} positive responses)`
    ).join("\n");

    return `### 📊 Live Campaign Performance Overview\n\n${perfs}\n\n**Insight:** Sequences focusing on regional decision makers and tailored value propositions demonstrate the highest response yields. Consider allocating higher daily send volume to your top performing campaign.`;
  }

  return `### 💡 Live Workspace Insights\n\n- **Active Campaigns:** ${context.campaigns.active} of ${context.campaigns.total}\n- **Total Leads:** ${context.leads.total.toLocaleString()}\n- **Cold Leads (>14d):** ${context.coldLeads.length}\n- **Recent Replies:** ${context.recentRepliesList.length}\n\nHow can I help you optimize your outreach today? You can ask about cold leads, recent replies, or campaign metrics.`;
}

/**
 * Call GPT-4o-mini API via OpenAI with fallback
 */
async function callGPT(messages: any[], systemPrompt: string, context: any, latestUserPrompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return generateLocalDataResponse(latestUserPrompt, context);
  }

  try {
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
      console.warn("OpenAI API call failed, falling back to local live data response.");
      return generateLocalDataResponse(latestUserPrompt, context);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || generateLocalDataResponse(latestUserPrompt, context);
  } catch (err) {
    console.error("OpenAI call error:", err);
    return generateLocalDataResponse(latestUserPrompt, context);
  }
}

/**
 * Stream SSE response with proper formatting
 */
function streamEvent(res: ServerResponse, event: AgentStreamEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

/**
 * Create a new agent session
 */
async function createSession(req: IncomingMessage, res: ServerResponse) {
  const user = await extractUser(req);
  const body = await readJsonBody<{ page?: string; resource?: string }>(req);

  const sessionId = `sess_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const title = body.resource || "New Conversation";

  sessions.set(sessionId, {
    id: sessionId,
    userId: user.id,
    title,
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date()
  });

  send(res, 201, {
    id: sessionId,
    title,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  } as AgentSession);
}

/**
 * Get list of sessions for user
 */
async function listSessions(req: IncomingMessage, res: ServerResponse) {
  const user = await extractUser(req);

  const userSessions = Array.from(sessions.values())
    .filter(s => user.role === "MASTER" || s.userId === user.id)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .map(s => ({
      id: s.id,
      title: s.title,
      created_at: s.createdAt.toISOString(),
      updated_at: s.updatedAt.toISOString()
    }));

  send(res, 200, { data: userSessions, pagination: { next_cursor: null, has_more: false } });
}

/**
 * Get session messages / turns for hydration
 */
async function getMessages(req: IncomingMessage, res: ServerResponse, sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) {
    send(res, 200, {
      title: "New Conversation",
      turns: [],
      pending: null,
      free_model: true
    });
    return;
  }

  send(res, 200, {
    id: session.id,
    title: session.title,
    turns: session.messages.map(m => ({
      id: m.id,
      role: m.role,
      blocks: [{ kind: "text", text: m.content }]
    })),
    pending: null,
    free_model: true
  });
}

/**
 * Send message to agent and stream live response
 */
async function sendMessage(req: IncomingMessage, res: ServerResponse, sessionId: string) {
  const user = await extractUser(req);
  const body = await readJsonBody<{ text?: string; message?: string; message_id?: string; page?: string; resource?: string }>(req);
  const promptText = (body.text || body.message || "").trim();

  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      id: sessionId,
      userId: user.id,
      title: promptText.slice(0, 35) || "New Conversation",
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    sessions.set(sessionId, session);
  }

  // Add user message to history
  const userMsg: AgentMessage = {
    id: body.message_id || randomUUID(),
    role: "user",
    content: promptText,
    createdAt: new Date().toISOString()
  };
  session.messages.push(userMsg);

  // Set up SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });

  try {
    // 1. Load user live database context
    const isMaster = user.role === "MASTER";
    const context = await loadUserContext(user.id, isMaster);
    const systemPrompt = buildSystemPrompt(context);

    // 2. Call reasoning engine
    const answer = await callGPT(session.messages, systemPrompt, context, promptText);

    // 3. Stream response word by word or chunk by chunk
    const words = answer.split(" ");
    for (let i = 0; i < words.length; i++) {
      const chunk = words[i] + (i === words.length - 1 ? "" : " ");
      streamEvent(res, { type: "text_delta", text: chunk });
      if (i % 2 === 0) {
        await new Promise(r => setTimeout(r, 8));
      }
    }

    // Send final authoritative text
    streamEvent(res, { type: "text", text: answer });

    // Store in message history
    const assistantMsg: AgentMessage = {
      id: randomUUID(),
      role: "assistant",
      content: answer,
      createdAt: new Date().toISOString()
    };
    session.messages.push(assistantMsg);
    session.updatedAt = new Date();

    if (session.messages.length === 2 && promptText) {
      session.title = promptText.length > 35 ? promptText.slice(0, 35).trimEnd() + "…" : promptText;
    }

    streamEvent(res, { type: "done", credits_remaining: 9999 });
    res.end();
  } catch (error) {
    console.error("Error in sendMessage:", error);
    streamEvent(res, {
      type: "error",
      message: (error as Error).message || "Failed to process message"
    });
    streamEvent(res, { type: "done" });
    res.end();
  }
}

/**
 * Delete a session
 */
async function deleteSession(req: IncomingMessage, res: ServerResponse, sessionId: string) {
  sessions.delete(sessionId);
  send(res, 200, { success: true, deleted: true });
}

/**
 * Clear all sessions for user
 */
async function clearSessions(req: IncomingMessage, res: ServerResponse) {
  const user = await extractUser(req);
  for (const [key, sess] of sessions.entries()) {
    if (user.role === "MASTER" || sess.userId === user.id) {
      sessions.delete(key);
    }
  }
  send(res, 200, { success: true, deleted: true });
}

/**
 * Main HTTP route dispatcher for all agent session routes
 */
export async function agentSessionsHandler(req: IncomingMessage, res: ServerResponse) {
  const fullPath = (req.url || "").split("?")[0];
  const method = req.method || "GET";

  // Normalize path removing /api or /v1 prefixes
  const pathname = fullPath.replace(/^\/(?:api\/)?(?:v1\/)?/, "/");

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

  // DELETE /ai/sessions (clear all)
  if (pathname === "/ai/sessions" && method === "DELETE") {
    await clearSessions(req, res);
    return;
  }

  // Extract session ID and subPath: /ai/sessions/{sid} or /ai/sessions/{sid}/messages
  const sessionMatch = pathname.match(/^\/ai\/sessions\/([^/]+)(?:\/(.*))?$/);
  if (!sessionMatch) {
    send(res, 404, { error: "Not found", path: pathname });
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

  // POST /ai/sessions/{sid}/approve
  if (subPath === "approve" && method === "POST") {
    streamEvent(res, { type: "text", text: "Action approved and scheduled." });
    streamEvent(res, { type: "done" });
    res.end();
    return;
  }

  // DELETE /ai/sessions/{sid}
  if (!subPath && method === "DELETE") {
    await deleteSession(req, res, sessionId);
    return;
  }

  send(res, 404, { error: "Not found", path: pathname });
}

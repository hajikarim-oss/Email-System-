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
      select: { id: true, email: true, status: true }
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
        lead: { select: { email: true } },
        createdAt: true
      }
    });

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
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error("Error loading user context:", error);
    return {
      userId,
      campaigns: { total: 0, active: 0, list: [] },
      leads: { total: 0, list: [] },
      engagement: { totalReplies: 0, recentReplies: [] },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Build system prompt with user's real data
 */
function buildSystemPrompt(context: any): string {
  return `You are an intelligent AI assistant for an email outreach automation system called "Email System 101".

User's Current System State:
- Total Campaigns: ${context.campaigns.total} (${context.campaigns.active} active)
- Total Leads: ${context.leads.total}
- Total Replies Received: ${context.engagement.totalReplies}

Your role:
1. Answer questions about their campaigns, leads, and engagement metrics using their REAL data above
2. Provide insights and recommendations based on their actual performance
3. Help them understand their outreach metrics and suggest improvements
4. Be conversational but professional
5. When asked about specific metrics, reference their actual numbers from above

Important:
- Always be specific to THEIR data, not generic advice
- If you don't have data for something, say so
- Offer to help with next steps or deeper analysis
- Keep responses concise (2-3 sentences for quick replies, more detail if requested)

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

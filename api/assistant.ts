/**
 * AI System Assistant API Endpoint
 * Provides intelligent diagnosis and guidance for the Email System 101
 * Think of it as a "Claudflare AI" that understands your entire system
 */

import { IncomingMessage, ServerResponse } from "http";
import { readJsonBody, send } from "../server/handlers/send";
import SYSTEM_CONTEXT from "../server/assistantContext";

type AssistantRequest = {
  query?: string;
  type?: "diagnose" | "explain" | "troubleshoot" | "health-check";
  context?: Record<string, unknown>;
};

/**
 * Health Check - Is the system running?
 */
async function healthCheck(req: IncomingMessage, res: ServerResponse) {
  const checks = {
    backend: "✅ Online",
    frontend: "Visit http://localhost:5173",
    database: "Check DATABASE_URL in .env",
    smartlead: "API key: " + (process.env.SMARTLEAD_API_KEY ? "✅ Configured" : "❌ Missing"),
  };

  send(res, 200, {
    status: "healthy",
    timestamp: new Date().toISOString(),
    system: SYSTEM_CONTEXT.name,
    checks,
    systemInfo: {
      nodeVersion: process.version,
      platform: process.platform,
      uptime: Math.round(process.uptime() / 60) + " minutes",
    },
  });
}

/**
 * Diagnose Issues
 * User describes problem → AI analyzes and suggests fixes
 */
async function diagnose(query: string): Promise<{
  issue: string;
  rootCauses: string[];
  solutions: string[];
  nextSteps: string[];
  relatedDocs: string[];
}> {
  const q = query.toLowerCase();

  // Detect issue type
  if (q.includes("login") || q.includes("401") || q.includes("unauthorized")) {
    return {
      issue: "Authentication Issue",
      rootCauses: SYSTEM_CONTEXT.diagnostics.loginError.rootCauses,
      solutions: SYSTEM_CONTEXT.diagnostics.loginError.solutions,
      nextSteps: [
        "1. Check VITE_API_URL is set in web/.env",
        "2. Verify backend is running: curl http://localhost:3001/api/health",
        "3. Check database connection: psql $DATABASE_URL -c 'SELECT 1'",
        "4. Review backend logs for errors",
      ],
      relatedDocs: [
        "api/handlers/auth.ts - Authentication endpoint",
        "server/auth.ts - Auth logic (scrypt hashing, sessions)",
        "web/src/lib/api/hooks/auth/useLogin.ts - Frontend login",
      ],
    };
  }

  if (q.includes("campaign") || q.includes("not showing") || q.includes("visibility")) {
    return {
      issue: "Campaign Visibility Issue",
      rootCauses: SYSTEM_CONTEXT.diagnostics.campaignVisibilityIssue.rootCauses,
      solutions: SYSTEM_CONTEXT.diagnostics.campaignVisibilityIssue.solutions,
      nextSteps: [
        "1. Check React Query cache key in useCampaigns.ts includes userId",
        "2. Verify campaign query has team filtering in api/intelligence/campaigns.ts",
        "3. Clear localStorage and hard refresh (Ctrl+Shift+R)",
        "4. Check database: SELECT * FROM Campaign WHERE userId = '...'",
      ],
      relatedDocs: [
        "web/src/lib/api/hooks/app/campaigns/useCampaigns.ts",
        "api/intelligence/campaigns.ts",
        "server/scope.ts - Access control logic",
      ],
    };
  }

  if (q.includes("webhook") || q.includes("sync") || q.includes("smartlead")) {
    return {
      issue: "Smartlead Webhook / Sync Issue",
      rootCauses: [
        "Webhook signature verification failed",
        "SMARTLEAD_WEBHOOK_SECRET not set in .env",
        "API key expired or invalid",
        "Event processing queue backed up",
      ],
      solutions: [
        "Verify .env has SMARTLEAD_WEBHOOK_SECRET",
        "Check webhook logs in server/smartleadWebhook.ts",
        "Test signature verification: npm run test:webhook",
        "Check if Smartlead is sending events to correct URL",
      ],
      nextSteps: [
        "1. Log into Smartlead → Settings → Webhooks",
        "2. Verify endpoint URL matches your server",
        "3. Check webhook delivery logs in Smartlead dashboard",
        "4. View incoming webhooks in app logs",
      ],
      relatedDocs: [
        "api/webhooks/smartlead.ts - Webhook handler",
        "server/smartleadWebhook.ts - Event processing",
        ".env - SMARTLEAD_WEBHOOK_SECRET required",
      ],
    };
  }

  if (q.includes("slow") || q.includes("performance") || q.includes("timeout")) {
    return {
      issue: "Performance Issue",
      rootCauses: SYSTEM_CONTEXT.diagnostics.performanceIssue.rootCauses,
      solutions: SYSTEM_CONTEXT.diagnostics.performanceIssue.solutions,
      nextSteps: [
        "1. Open DevTools → Performance tab",
        "2. Record a profile while loading campaigns",
        "3. Check database query time: EXPLAIN ANALYZE",
        "4. Review React component re-render frequency",
      ],
      relatedDocs: [
        "web/src/lib/api/hooks/app/campaigns/useCampaigns.ts - Caching config",
        "api/intelligence/campaigns.ts - Database query",
      ],
    };
  }

  return {
    issue: "Unknown Issue",
    rootCauses: ["Please describe the issue in more detail"],
    solutions: ["See related documentation"],
    nextSteps: ["1. Check system logs", "2. Review error messages", "3. Contact support"],
    relatedDocs: ["None found for this query"],
  };
}

/**
 * Explain - User asks "how does X work?"
 */
async function explain(query: string): Promise<{
  topic: string;
  explanation: string;
  diagram: string;
  code_example: string;
  relatedTopics: string[];
}> {
  const q = query.toLowerCase();

  if (q.includes("login")) {
    return {
      topic: "How does login work?",
      explanation: `
1. User enters email/password on frontend (/auth/login)
2. Frontend calls POST /api/auth/login with credentials
3. Backend validates: findUserByEmail() then verifyPassword()
4. If valid: createSession() generates token + stores in Session table
5. Response: {token, user} returned to frontend
6. Frontend stores token in localStorage['tbm_session']
7. All future requests include: Authorization: Bearer <token>
8. Backend validatees token on every request via resolveToken()
      `,
      diagram: `
User → [email+pwd] → Frontend → POST /auth/login → Backend
  ↓
findUserByEmail() → verifyPassword() → createSession()
  ↓
[token generated] → [stored in Session table] → [expires in 30 days]
  ↓
Response: {token, user} → Frontend stores in localStorage
  ↓
All requests: Authorization: Bearer <token>
      `,
      code_example: `
// Frontend: web/src/lib/api/hooks/auth/useLogin.ts
const { mutate: login } = useLogin();
login({email, password}, {
  onSuccess: (data) => {
    saveTokens(data);
    navigate("/app/dashboard");
  }
});

// Backend: api/handlers/auth.ts
const user = await findUserByEmail(email);
const ok = await verifyPassword(password, await readPassword(user.id));
if (ok) {
  const session = await createSession(user.id);
  send(res, 200, {token, user});
}
      `,
      relatedTopics: [
        "How are passwords hashed?",
        "What happens after login?",
        "How is access control enforced?",
      ],
    };
  }

  if (q.includes("campaign") && q.includes("visibility")) {
    return {
      topic: "How does campaign visibility work?",
      explanation: `
Campaign visibility is determined by user role + team membership:

MASTER users: See ALL campaigns in the system

TEAM_MEMBER users: See campaigns where they share a Team with the campaign owner
  - Get all teams the user belongs to (via UserTeam table)
  - Find all users in those teams
  - Get campaigns from those users

This is enforced:
1. In the database query (SQL WHERE clause in api/intelligence/campaigns.ts)
2. On the frontend (React Query cache key includes userId)
3. On every API request (requireUser() validates authorization)
      `,
      diagram: `
User A (MASTER) → Sees ALL campaigns
User B (TEAM_MEMBER, Team: Sales) → Sees campaigns from:
  - User B's own campaigns
  - User C's campaigns (also in Sales team)
  - User D's campaigns (also in Sales team)

Database logic:
SELECT c.* FROM Campaign c
WHERE user.role = 'MASTER'
  OR EXISTS (
    SELECT 1 FROM UserTeam ut
    WHERE ut.userId IN (
      SELECT userId FROM UserTeam WHERE teamId IN (
        SELECT teamId FROM UserTeam WHERE userId = current_user_id
      )
    )
    AND ut.teamId = ANY(current_user_teams)
  )
      `,
      code_example: `
// Frontend: useCampaigns() cache key
queryKey: ["campaigns", "list", query, folder, limit, userId]
//                                                   ^^^^^^
//                                    userId ensures per-user caching

// Backend: api/intelligence/campaigns.ts
const scope = scopeFor(user);  // Returns {userId, master}
if (scope.master) {
  // Query: SELECT * FROM Campaign (all)
} else {
  // Query: SELECT * FROM Campaign WHERE userId IN (
  //   SELECT userId FROM UserTeam WHERE teamId IN (
  //     SELECT teamId FROM UserTeam WHERE userId = $1
  //   )
  // )
}
      `,
      relatedTopics: [
        "How does team membership work?",
        "What is the Team model?",
        "How is access control enforced?",
      ],
    };
  }

  return {
    topic: query,
    explanation: "Topic explanation not found in knowledge base",
    diagram: "N/A",
    code_example: "See related documentation",
    relatedTopics: ["Check system documentation"],
  };
}

/**
 * Troubleshoot - Interactive step-by-step debugging
 */
async function troubleshoot(query: string): Promise<{
  issue: string;
  steps: Array<{
    number: number;
    action: string;
    expected: string;
    ifFailed: string;
  }>;
  commonMistakes: string[];
}> {
  const q = query.toLowerCase();

  if (q.includes("login")) {
    return {
      issue: "Login not working",
      steps: [
        {
          number: 1,
          action: "Check backend is running: lsof -i :3001 (Mac) or netstat -ano | grep 3001 (Windows)",
          expected: "Backend process visible (Node.js or tsx)",
          ifFailed: "Start backend: cd . && npm run dev OR PORT=3001 npm run dev",
        },
        {
          number: 2,
          action: "Check frontend can reach backend: curl http://localhost:3001/api/health",
          expected: "JSON response with status: healthy",
          ifFailed: "Verify VITE_API_URL in web/.env points to http://localhost:3001",
        },
        {
          number: 3,
          action: "Check database connection: psql $DATABASE_URL -c 'SELECT 1'",
          expected: "(1 row) returned",
          ifFailed: "Verify DATABASE_URL in .env is correct, check Supabase status",
        },
        {
          number: 4,
          action: "Check user exists: psql $DATABASE_URL -c 'SELECT * FROM \"User\" WHERE email = ...'",
          expected: "User row returned",
          ifFailed: "Create user using scripts/setup-users.js",
        },
        {
          number: 5,
          action: "Try login with correct email/password",
          expected: "Redirected to /app/dashboard, token in localStorage",
          ifFailed: "Check backend logs for error message",
        },
      ],
      commonMistakes: [
        "VITE_API_URL is empty (should be http://localhost:3001 or backend URL)",
        "Backend not running (still running old process on same port)",
        "DATABASE_URL has wrong credentials",
        "User doesn't exist in database",
        "Password hash format incorrect (should be scrypt format)",
      ],
    };
  }

  return {
    issue: query,
    steps: [
      {
        number: 1,
        action: "Check system health",
        expected: "All services running",
        ifFailed: "See troubleshooting guide",
      },
    ],
    commonMistakes: ["Check documentation for this issue type"],
  };
}

/**
 * Main Assistant Handler
 */
export async function assistantHandler(req: IncomingMessage, res: ServerResponse) {
  const method = req.method || "GET";
  const url = req.url || "";

  // GET /api/assistant/health - System status
  if (url === "/api/assistant/health" && method === "GET") {
    return healthCheck(req, res);
  }

  // POST /api/assistant/query - AI query processing
  if (url === "/api/assistant/query" && method === "POST") {
    try {
      const body = await readJsonBody<AssistantRequest>(req);
      const { query, type = "diagnose" } = body;

      if (!query) {
        return send(res, 400, { error: "Missing 'query' field" });
      }

      let result;

      switch (type) {
        case "diagnose":
          result = await diagnose(query);
          break;
        case "explain":
          result = await explain(query);
          break;
        case "troubleshoot":
          result = await troubleshoot(query);
          break;
        case "health-check":
          return healthCheck(req, res);
        default:
          return send(res, 400, { error: `Unknown type: ${type}` });
      }

      return send(res, 200, {
        success: true,
        type,
        query,
        response: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[Assistant Error]", error);
      return send(res, 500, {
        error: "Assistant encountered an error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // GET /api/assistant/docs - System documentation
  if (url === "/api/assistant/docs" && method === "GET") {
    return send(res, 200, {
      name: SYSTEM_CONTEXT.name,
      version: SYSTEM_CONTEXT.version,
      endpoints: {
        "/api/assistant/health": "GET - System health check",
        "/api/assistant/query": "POST - Query AI assistant",
        "/api/assistant/docs": "GET - This documentation",
        "/api/assistant/schema": "GET - Database schema",
        "/api/assistant/workflows": "GET - Data flow workflows",
      },
      supportedQueryTypes: ["diagnose", "explain", "troubleshoot", "health-check"],
      exampleQueries: [
        "why is login not working?",
        "how does campaign visibility work?",
        "help me debug webhook issues",
        "what's wrong with performance?",
      ],
    });
  }

  // GET /api/assistant/schema - Database schema reference
  if (url === "/api/assistant/schema" && method === "GET") {
    return send(res, 200, SYSTEM_CONTEXT.schema);
  }

  // GET /api/assistant/workflows - Data flow documentation
  if (url === "/api/assistant/workflows" && method === "GET") {
    return send(res, 200, SYSTEM_CONTEXT.workflows);
  }

  return send(res, 404, { error: "Assistant endpoint not found" });
}

export default assistantHandler;

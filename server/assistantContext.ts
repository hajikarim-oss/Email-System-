/**
 * AI Assistant Context - Comprehensive System Knowledge
 * This file serves as the "brain" for an AI assistant that understands
 * the Email System 101 architecture, data flows, and common issues.
 */

export const SYSTEM_CONTEXT = {
  name: "Email System 101 - AI Assistant",
  version: "1.0.0",
  deployment: {
    frontend: {
      framework: "React 19 + Vite",
      port: 5173,
      location: "web/",
      deployment: "Vercel",
    },
    backend: {
      framework: "Node.js HTTP (native) + TypeScript",
      port: 3001,
      location: "api/",
      deployment: "VPS + PM2",
    },
    database: {
      type: "PostgreSQL 14+",
      provider: "Supabase",
      pooling: "PgBouncer (max 10 connections)",
    },
  },

  /**
   * Common Problems & Solutions
   */
  diagnostics: {
    loginError: {
      symptoms: ["Cannot read properties of undefined", "401 Unauthorized", "500 Internal Server Error"],
      rootCauses: [
        "API_URL environment variable empty or wrong",
        "Backend /auth/config endpoint not responding",
        "Mock data system disabled but real API unreachable",
        "CORS headers missing from response",
        "Database connection failed",
      ],
      solutions: [
        "Check .env: VITE_API_URL must be set to backend URL",
        "Verify backend is running: curl http://localhost:3000/api/v1/auth/config",
        "Check backend logs for connection errors",
        "Ensure DATABASE_URL is valid in .env",
        "Review CORS headers in api/index.ts",
      ],
    },

    campaignVisibilityIssue: {
      symptoms: ["Master sees all campaigns but team member sees none", "Campaigns visible on one device but not another", "Deleted campaigns still showing"],
      rootCauses: [
        "React Query cache key doesn't include userId → cross-user data pollution",
        "Campaign query missing team membership check",
        "Cache not invalidated after delete",
        "staleTime too high → stale data not refreshed",
      ],
      solutions: [
        "Verify useCampaigns.ts cache key includes userId",
        "Check api/intelligence/campaigns.ts GET for team filtering logic",
        "Confirm useDeleteCampaign.ts invalidates React Query cache",
        "Set staleTime: 0, gcTime: 0 in React Query config",
        "Clear localStorage and hard refresh (Ctrl+Shift+R)",
      ],
    },

    dataNotSyncing: {
      symptoms: ["Frontend shows different data than database", "Manual DB update not reflected in UI", "Campaign status changes not visible"],
      rootCauses: [
        "React Query cache not invalidated after mutation",
        "staleTime too high (query assumes data is fresh)",
        "Webhook not processed (Smartlead events not ingested)",
        "Database transaction isolation issue",
      ],
      solutions: [
        "Call queryClient.invalidateQueries() after mutations",
        "Reduce staleTime for real-time data (3-5 seconds)",
        "Check webhook logs: are Smartlead events being received?",
        "Verify webhook signature validation passes",
        "Check TRANSACTION isolation level (should be SERIALIZABLE)",
      ],
    },

    performanceIssue: {
      symptoms: ["Page takes >3 seconds to load", "UI freezes when clicking buttons", "API requests slow/timeout"],
      rootCauses: [
        "N+1 query problem (fetching one-by-one instead of batch)",
        "Database query missing indexes",
        "No pagination (loading all 30K campaigns at once)",
        "React re-renders happening on every keystroke",
      ],
      solutions: [
        "Enable query logging: SET log_statement = 'all'; in PostgreSQL",
        "Check EXPLAIN ANALYZE on slow queries",
        "Verify indexes exist on frequently-filtered columns",
        "Implement pagination (limit=50, cursor-based offset)",
        "Use React.memo() and useMemo() to prevent unnecessary re-renders",
      ],
    },
  },

  /**
   * Data Flow Checklists
   */
  workflows: {
    userLogin: {
      steps: [
        "1. Frontend: User enters email/password → frontend/src/app/auth/login/page.tsx",
        "2. Validation: React Hook Form validates email format",
        "3. API Call: POST /api/auth/login with {email, password}",
        "4. Backend: api/handlers/auth.ts receives request",
        "5. Auth: server/auth.ts calls findUserByEmail() + verifyPassword()",
        "6. Session: createSession() stores token in Session table with 30-day expiry",
        "7. Response: Send token + user profile back to frontend",
        "8. Storage: Frontend stores token in localStorage['tbm_session']",
        "9. Routing: Redirect to /app/dashboard (authenticated area)",
        "10. Persistence: All subsequent requests include Authorization: Bearer <token>",
      ],
      checkpoints: [
        "Is DATABASE_URL set?",
        "Can backend connect to Supabase?",
        "Does User table have this email?",
        "Is password hash in correct scrypt format?",
        "Is Session table accepting inserts?",
        "Is localStorage working in browser?",
      ],
    },

    campaignVisibility: {
      steps: [
        "1. Frontend: useCampaigns() hook mounts with cache key [campaigns, list, ..., userId]",
        "2. Query Check: React Query checks if cache key exists + not stale",
        "3. If miss: Makes GET /api/campaigns to backend",
        "4. Backend: api/intelligence/campaigns.ts gets request",
        "5. Auth: requireUser() validates token → AuthUser object",
        "6. Scoping: scopeFor(user) determines visibility rules",
        "   - Master: sees ALL campaigns",
        "   - TeamMember: sees campaigns where they're on the same Team",
        "7. Query: Constructs SQL with WHERE clause filtering by scope",
        "8. DB: Executes SELECT from Campaign with team-aware predicates",
        "9. Response: Returns [campaign, campaign, ...] to frontend",
        "10. Cache: React Query stores with cache key = [campaigns, list, ..., userId]",
        "11. Render: CampaignCard components displayed",
      ],
      checkpoints: [
        "Is userId in cache key? (prevents cross-user pollution)",
        "Is useAuthConfig() called before useCampaigns()? (user data required)",
        "Is campaign query including team membership check?",
        "Are indexes on Campaign[userId, status] present?",
        "Is staleTime set to 0 for fresh data?",
      ],
    },

    smartleadWebhookIngestion: {
      steps: [
        "1. External: Smartlead POSTs event to http://yourserver/api/webhooks/smartlead",
        "2. Verification: api/webhooks/smartlead.ts verifies x-smartlead-signature HMAC",
        "3. Parsing: Extract event_type, email, campaign_id, etc. from JSON body",
        "4. Normalization: Map Smartlead event type → internal type (sent/opened/replied/bounced/unsubscribed)",
        "5. Suppression: If hard bounce/unsubscribe: INSERT into SuppressedEmail table",
        "6. Lead Update: Find Lead by email + campaignId",
        "7. Counters: Increment Lead.totalMessages, Lead.totalOpens, etc.",
        "8. Event Log: INSERT into EmailEvent table (append-only)",
        "9. Recalculation: Update Lead.recencyBucket + Lead.outreachState",
        "10. Response: Send 200 OK to Smartlead (or 503 if failed for retry)",
      ],
      checkpoints: [
        "Is webhook signature secret in .env? (SMARTLEAD_WEBHOOK_SECRET)",
        "Is HMAC verification passing? (check logs)",
        "Are EmailEvent records being created?",
        "Are Lead counters being updated?",
        "Is SuppressedEmail table growing?",
        "Are concurrent webhook requests handled? (MAX_CONCURRENT_WRITES=5)",
      ],
    },
  },

  /**
   * Key Data Model Relationships
   */
  schema: {
    User: {
      columns: ["id", "email", "password (scrypt)", "role (MASTER|TEAM_MEMBER)", "name", "image", "teams[]"],
      relationships: {
        campaigns: "1:many (User.id → Campaign.userId)",
        sessions: "1:many (User.id → Session.userId)",
        teams: "many:many (via UserTeam)",
      },
      constraints: ["email UNIQUE", "password NOT NULL"],
      indexes: ["email"],
    },

    Campaign: {
      columns: [
        "id (cuid)",
        "userId (fk User)",
        "name (string, unique per user)",
        "status (DRAFT|ACTIVE|PAUSED|COMPLETED)",
        "providerCampaignId (Smartlead ID)",
        "createdAt",
        "updatedAt",
      ],
      relationships: {
        owner: "many:1 (Campaign.userId → User.id)",
        leads: "1:many (Campaign.id → Lead.campaignId)",
        steps: "1:many (Campaign.id → CampaignStep.campaignId)",
        mailboxes: "many:many (via CampaignMailbox)",
      },
      constraints: [
        "UNIQUE(userId, name)",
        "status IN (DRAFT, ACTIVE, PAUSED, COMPLETED)",
        "ON DELETE CASCADE → Lead, CampaignStep",
      ],
      indexes: [
        "Campaign[userId, status]",
        "Campaign[providerCampaignId]",
      ],
    },

    Lead: {
      columns: [
        "id (cuid)",
        "campaignId (fk Campaign)",
        "email (string)",
        "status (ACTIVE|SUPPRESSED|BOUNCED|UNSUBSCRIBED|REPLIED)",
        "totalMessages (int)",
        "totalOpens (int)",
        "totalClicks (int)",
        "totalReplies (int)",
        "totalBounces (int)",
        "lastContactedAt (datetime)",
        "scores (JSONB: domain_authority, company_size, etc.)",
      ],
      relationships: {
        campaign: "many:1 (Lead.campaignId → Campaign.id)",
        events: "1:many (Lead.id → EmailEvent.leadId)",
      ],
      constraints: [
        "status IN (ACTIVE, SUPPRESSED, BOUNCED, UNSUBSCRIBED, REPLIED)",
        "ON DELETE CASCADE from Campaign",
      ],
      indexes: [
        "Lead[campaignId, status]",
        "Lead[email]",
        "Lead[lastContactedAt]",
      ],
    },

    Team: {
      columns: [
        "id (cuid)",
        "name (string)",
        "description (text)",
        "createdAt",
        "updatedAt",
      ],
      relationships: {
        members: "many:many (via UserTeam)",
        campaigns: "implicit (Team → UserTeam → User → Campaign)",
      },
      constraints: ["name NOT NULL"],
      indexes: ["Team[id]"],
    },

    UserTeam: {
      columns: [
        "userId (fk User)",
        "teamId (fk Team)",
        "joinedAt (datetime)",
      ],
      relationships: {
        user: "many:1 (UserTeam.userId → User.id)",
        team: "many:1 (UserTeam.teamId → Team.id)",
      },
      constraints: [
        "PRIMARY KEY (userId, teamId)",
        "ON DELETE CASCADE from Team",
      ],
      indexes: ["UserTeam[teamId]"],
    },

    EmailEvent: {
      columns: [
        "id (cuid)",
        "leadId (fk Lead)",
        "eventType (SENT|OPENED|CLICKED|REPLIED|BOUNCED|UNSUBSCRIBED)",
        "rawPayload (JSONB: full Smartlead webhook data)",
        "createdAt",
        "providerEventId (Smartlead event ID, unique per webhook)",
      ],
      relationships: {
        lead: "many:1 (EmailEvent.leadId → Lead.id)",
      },
      constraints: [
        "eventType NOT NULL",
        "UNIQUE(providerEventId) - idempotent webhook processing",
        "ON DELETE CASCADE from Lead",
      ],
      indexes: [
        "EmailEvent[leadId, eventType, createdAt]",
        "EmailEvent[createdAt DESC] - for analytics queries",
      ],
    },

    SuppressedEmail: {
      columns: [
        "id (cuid)",
        "email (string)",
        "reason (HARD_BOUNCE|UNSUBSCRIBED|COMPLAINED|MANUAL)",
        "source (string, e.g., campaignId or 'manual')",
        "addedBy (userId, if reason=MANUAL)",
        "createdAt",
      ],
      relationships: {
        addedByUser: "many:1 (SuppressedEmail.addedBy → User.id, nullable)",
      ],
      constraints: [
        "UNIQUE(email)",
        "reason IN (HARD_BOUNCE, UNSUBSCRIBED, COMPLAINED, MANUAL)",
      ],
      indexes: ["SuppressedEmail[email]"],
    },
  },

  /**
   * Environment Variables Required
   */
  env: {
    DATABASE_URL: "PostgreSQL connection string (Supabase pooler endpoint)",
    DIRECT_URL: "PostgreSQL direct connection (Prisma needs this for migrations)",
    SMARTLEAD_API_KEY: "Primary API key for Smartlead REST API",
    SMARTLEAD_SECONDARY_API_KEY: "Fallback key if primary fails",
    SMARTLEAD_WEBHOOK_SECRET: "Secret for HMAC webhook signature verification",
    NODE_ENV: "development | production",
    PORT: "API server port (default 3001)",
    VITE_API_URL: "Frontend: URL of backend API (e.g., http://localhost:3000)",
    VITE_APP_URL: "Frontend: URL of frontend app (e.g., http://localhost:5173)",
  },

  /**
   * Debugging Commands
   */
  debugging: {
    checkBackendHealth: "curl http://localhost:3001/api/health",
    checkAuthConfig: "curl http://localhost:3001/api/auth/config",
    testDatabaseConnection: "psql $DATABASE_URL -c 'SELECT 1'",
    checkProcesses: "pm2 status OR lsof -i :3001 (Unix) / netstat -ano | grep 3001 (Windows)",
    viewBackendLogs: "pm2 logs email-system-api",
    viewViteLogs: "npm run dev (in web/ directory)",
    clearReactCache: "localStorage.clear() in browser console",
    testSmartleadAPI: "curl -H 'Authorization: Bearer $SMARTLEAD_API_KEY' https://server.smartlead.ai/api/v1/campaigns",
  },

  /**
   * Performance Metrics & Health Indicators
   */
  metrics: {
    pageLoadTarget: "< 2 seconds (campaigns list)",
    apiResponseTarget: "< 500ms (50th percentile)",
    databaseQueryTarget: "< 100ms (SELECT on indexed columns)",
    cacheHitRateTarget: "> 80% (React Query cache hits)",
    webhookProcessingTarget: "< 1s per event",
    errorRateTarget: "< 0.1% of requests",
  },

  /**
   * Security Checklist
   */
  security: {
    authentication: [
      "✅ Scrypt hashing with proper salt",
      "✅ Session tokens (32-byte random)",
      "✅ 30-day expiry with server-side revocation",
      "⚠️  localStorage: Vulnerable to XSS (no HttpOnly cookie available)",
    ],
    authorization: [
      "✅ Row-level access control via scope.ts",
      "✅ requireUser() validates on every request",
      "✅ Team-based visibility enforced in SQL",
      "⚠️  TODO: Workspace isolation not yet implemented",
    ],
    dataProtection: [
      "✅ SSL/TLS to database (Supabase)",
      "✅ HMAC webhook signature verification",
      "✅ SQL parameterization (pg library handles)",
      "⚠️  TODO: Encrypted fields not implemented (emails stored plaintext)",
    ],
    apiSecurity: [
      "✅ CORS headers configured",
      "✅ Rate limiting on login (5 attempts / 15 min)",
      "✅ Input validation via Zod",
      "⚠️  TODO: API key rotation not automated",
    ],
  },
};

/**
 * Query Resolver - AI Assistant can use this to answer questions
 */
export function resolveQuery(question: string): string {
  const q = question.toLowerCase();

  if (q.includes("login") && q.includes("error")) {
    return JSON.stringify(SYSTEM_CONTEXT.diagnostics.loginError, null, 2);
  }
  if (q.includes("campaign") && q.includes("not showing")) {
    return JSON.stringify(SYSTEM_CONTEXT.diagnostics.campaignVisibilityIssue, null, 2);
  }
  if (q.includes("sync") || q.includes("webhook")) {
    return JSON.stringify(SYSTEM_CONTEXT.workflows.smartleadWebhookIngestion, null, 2);
  }
  if (q.includes("performance") || q.includes("slow")) {
    return JSON.stringify(SYSTEM_CONTEXT.diagnostics.performanceIssue, null, 2);
  }
  if (q.includes("login flow") || q.includes("how does")) {
    return JSON.stringify(SYSTEM_CONTEXT.workflows.userLogin, null, 2);
  }

  return "Query not recognized. Available topics: login-error, campaign-visibility, webhook-sync, performance, login-flow, schema, env-variables, debugging, security.";
}

export default SYSTEM_CONTEXT;

/**
 * AUTOMATION API
 *
 * Endpoints for managing the AI-powered autonomous sales engine
 * - Fetch leads
 * - Generate personalized emails
 * - Manage approval queue
 * - Monitor inbox
 * - Analyze replies
 * - Track learning & improvements
 */

import { IncomingMessage, ServerResponse } from "http";
import { readJsonBody, send } from "../../server/handlers/send";
import { scoreLead, generateIntelligentEmailSequence, analyzeReplyIntelligently } from "../../server/automation/intelligentEngine";
import { recommendStrategy, updateLeadConversationState, detectAnomalies, suggestImprovements } from "../../server/automation/orchestrator";
import { pgQuery } from "../../server/pg";

type AutomationRequest = {
  action?: string;
  leadId?: string;
  campaignId?: string;
  data?: Record<string, unknown>;
};

/**
 * POST /api/automation/score-lead
 *
 * Intelligently score a lead based on multiple factors
 * Returns: score, strategy, risks, opportunities
 */
async function scoreLeadEndpoint(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readJsonBody<{
      email: string;
      company: string;
      title: string;
      companyProducts?: string;
      companyTeamSize?: string;
    }>(req);

    const score = await scoreLead({
      email: body.email,
      company: body.company,
      title: body.title,
      companyProducts: body.companyProducts,
      companyTeamSize: body.companyTeamSize,
    });

    return send(res, 200, {
      success: true,
      lead: body,
      intelligence: score,
    });
  } catch (error) {
    return send(res, 500, {
      error: "Failed to score lead",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * POST /api/automation/generate-emails
 *
 * Generate a personalized 3-email sequence for a lead
 */
async function generateEmailsEndpoint(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readJsonBody<{
      lead: {
        email: string;
        firstName: string;
        lastName: string;
        title: string;
        company: string;
        companyProducts?: string;
        companyTeamSize?: string;
      };
      leadScore: any;
      yourProductValue: string;
      pastCampaignIds?: string[];
    }>(req);

    // Fetch past successful emails for context
    const pastEmails = await pgQuery(
      `
      SELECT
        subject,
        body,
        (SELECT COUNT(*) FROM "IncomingReply" WHERE emailId = ed.id AND classification = 'positive') as positive_responses,
        (SELECT COUNT(*) FROM "IncomingReply" WHERE emailId = ed.id) as total_responses
      FROM "EmailDraft" ed
      WHERE ed.campaignId = ANY($1)
      ORDER BY positive_responses DESC
      LIMIT 3
      `,
      [body.pastCampaignIds || []]
    );

    const sequence = await generateIntelligentEmailSequence({
      lead: body.lead,
      leadScore: body.leadScore,
      pastSuccessfulEmails: (pastEmails || []).map((e) => ({
        subject: e.subject,
        body: e.body,
        openRate: 0, // Would calculate from metrics
        responseRate: e.total_responses > 0 ? e.positive_responses / e.total_responses : 0,
        resultType: e.positive_responses > 0 ? "positive" : "rejection",
      })),
      yourProductValue: body.yourProductValue,
    });

    return send(res, 200, {
      success: true,
      sequence: sequence.sequence,
      overallApproach: sequence.overallApproach,
      personalizedInsights: sequence.personalizedInsights,
    });
  } catch (error) {
    return send(res, 500, {
      error: "Failed to generate emails",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * POST /api/automation/analyze-reply
 *
 * Intelligently analyze an incoming reply
 * Returns: classification, objection analysis, recommended action
 */
async function analyzeReplyEndpoint(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readJsonBody<{
      emailBody: string;
      emailSubject: string;
      senderName: string;
      originalEmailSubject: string;
      leadProfile: {
        title: string;
        company: string;
        companySize?: string;
      };
    }>(req);

    const analysis = await analyzeReplyIntelligently({
      emailBody: body.emailBody,
      emailSubject: body.emailSubject,
      senderName: body.senderName,
      originalEmailSubject: body.originalEmailSubject,
      leadProfile: body.leadProfile,
    });

    return send(res, 200, {
      success: true,
      analysis,
    });
  } catch (error) {
    return send(res, 500, {
      error: "Failed to analyze reply",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * GET /api/automation/recommend-strategy
 *
 * Based on historical data, recommend best strategy for a new lead
 */
async function recommendStrategyEndpoint(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const company = url.searchParams.get("company") || "";
    const title = url.searchParams.get("title") || "";
    const companySize = url.searchParams.get("companySize");

    const recommendation = await recommendStrategy({
      company,
      title,
      companySize,
      email: "",
    });

    return send(res, 200, {
      success: true,
      recommendation,
    });
  } catch (error) {
    return send(res, 500, {
      error: "Failed to recommend strategy",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * GET /api/automation/lead-state/:leadId
 *
 * Get current conversation state of a lead
 */
async function getLeadStateEndpoint(req: IncomingMessage, res: ServerResponse, leadId: string) {
  try {
    const state = await updateLeadConversationState(leadId);

    return send(res, 200, {
      success: true,
      state,
    });
  } catch (error) {
    return send(res, 500, {
      error: "Failed to get lead state",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * GET /api/automation/anomalies
 *
 * Detect unusual patterns that need human attention
 */
async function detectAnomaliesEndpoint(req: IncomingMessage, res: ServerResponse) {
  try {
    const anomalies = await detectAnomalies();

    return send(res, 200, {
      success: true,
      anomalies,
      requiresAction: anomalies.some((a) => a.severity === "high"),
    });
  } catch (error) {
    return send(res, 500, {
      error: "Failed to detect anomalies",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * GET /api/automation/improvements
 *
 * Get AI-suggested improvements based on performance data
 */
async function suggestImprovementsEndpoint(req: IncomingMessage, res: ServerResponse) {
  try {
    const suggestions = await suggestImprovements();

    return send(res, 200, {
      success: true,
      suggestions,
    });
  } catch (error) {
    return send(res, 500, {
      error: "Failed to get suggestions",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * POST /api/automation/approve-emails
 *
 * Manager approves and sends emails
 */
async function approveEmailsEndpoint(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = await readJsonBody<{
      emailIds: string[];
      managerNotes?: string;
    }>(req);

    // Update emails to APPROVED status
    await pgQuery(
      `
      UPDATE "EmailDraft"
      SET
        status = 'APPROVED',
        approvedAt = NOW(),
        approvedBy = $1
      WHERE id = ANY($2)
      `,
      ["manager-id", body.emailIds]
    );

    return send(res, 200, {
      success: true,
      message: `${body.emailIds.length} emails approved for sending`,
      approvedEmails: body.emailIds.length,
    });
  } catch (error) {
    return send(res, 500, {
      error: "Failed to approve emails",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * GET /api/automation/approval-queue
 *
 * Show pending emails waiting for approval
 */
async function getApprovalQueueEndpoint(req: IncomingMessage, res: ServerResponse) {
  try {
    const pendingEmails = await pgQuery(
      `
      SELECT
        ed.id,
        ed.subject,
        ed.body,
        ed.strategy,
        rl.firstName,
        rl.company,
        rl.title,
        rl.initial_score,
        ed.sequenceNumber,
        ed.generatedAt
      FROM "EmailDraft" ed
      JOIN "ResearchedLead" rl ON ed.leadId = rl.id
      WHERE ed.status = 'DRAFT'
      ORDER BY rl.initial_score DESC, ed.generatedAt DESC
      LIMIT 20
      `
    );

    return send(res, 200, {
      success: true,
      pendingCount: pendingEmails.length,
      emails: pendingEmails,
    });
  } catch (error) {
    return send(res, 500, {
      error: "Failed to get approval queue",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * GET /api/automation/dashboard
 *
 * Comprehensive automation dashboard
 */
async function getDashboardEndpoint(req: IncomingMessage, res: ServerResponse) {
  try {
    // Get key metrics
    const [metrics] = await pgQuery(
      `
      SELECT
        (SELECT COUNT(*) FROM "ResearchedLead") as total_leads,
        (SELECT COUNT(*) FROM "EmailDraft" WHERE status = 'DRAFT') as pending_approval,
        (SELECT COUNT(*) FROM "EmailDraft" WHERE status = 'SENT') as sent,
        (SELECT COUNT(*) FROM "IncomingReply" WHERE classification = 'positive') as positive_replies,
        (SELECT COUNT(*) FROM "IncomingReply") as total_replies,
        (SELECT COUNT(*) FROM "ResearchedLead" WHERE status = 'CONVERTED') as converted
      `
    );

    const anomalies = await detectAnomalies();
    const suggestions = await suggestImprovements();

    return send(res, 200, {
      success: true,
      metrics,
      anomalies: anomalies.filter((a) => a.severity === "high"),
      suggestions: suggestions.slice(0, 3),
      alerts: {
        approvalQueue: metrics.pending_approval,
        anomaliesHigh: anomalies.filter((a) => a.severity === "high").length,
      },
    });
  } catch (error) {
    return send(res, 500, {
      error: "Failed to get dashboard",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

/**
 * Main automation router
 */
export async function automationHandler(req: IncomingMessage, res: ServerResponse) {
  const url = req.url || "";
  const method = req.method || "GET";

  try {
    // POST endpoints
    if (method === "POST") {
      if (url === "/api/automation/score-lead") return scoreLeadEndpoint(req, res);
      if (url === "/api/automation/generate-emails") return generateEmailsEndpoint(req, res);
      if (url === "/api/automation/analyze-reply") return analyzeReplyEndpoint(req, res);
      if (url === "/api/automation/approve-emails") return approveEmailsEndpoint(req, res);
    }

    // GET endpoints
    if (method === "GET") {
      if (url === "/api/automation/recommend-strategy") return recommendStrategyEndpoint(req, res);
      if (url.startsWith("/api/automation/lead-state/")) {
        const leadId = url.split("/").pop();
        if (leadId) return getLeadStateEndpoint(req, res, leadId);
      }
      if (url === "/api/automation/anomalies") return detectAnomaliesEndpoint(req, res);
      if (url === "/api/automation/improvements") return suggestImprovementsEndpoint(req, res);
      if (url === "/api/automation/approval-queue") return getApprovalQueueEndpoint(req, res);
      if (url === "/api/automation/dashboard") return getDashboardEndpoint(req, res);
    }

    return send(res, 404, { error: "Automation endpoint not found" });
  } catch (error) {
    console.error("[Automation API Error]", error);
    return send(res, 500, {
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

export default automationHandler;

/**
 * ADAPTIVE AUTOMATION ORCHESTRATOR
 *
 * This is the "brain" that coordinates all operations.
 * It learns from results and continuously improves strategy.
 *
 * Key principle: Every action is tracked, every result is analyzed,
 * and the system gets smarter over time.
 */

import { pgQuery } from "../pg";
import { scoreLead, generateIntelligentEmailSequence, analyzeReplyIntelligently } from "./intelligentEngine";

/**
 * LEARNING LOOP MANAGER
 *
 * For each completed action, the system asks:
 * - "Did that work?"
 * - "Why or why not?"
 * - "What should we do differently next time?"
 */
export async function processAutomationLearningLoop(completedAction: {
  type: "email_sent" | "reply_received" | "followup_generated" | "call_booked";
  leadId: string;
  campaignId: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}) {
  console.log("[Learning Loop] Processing action:", completedAction.type);

  // Fetch context for analysis
  const [leadData] = await pgQuery(
    `SELECT * FROM "ResearchedLead" WHERE id = $1`,
    [completedAction.leadId]
  );

  if (!leadData) return;

  // Analyze based on action type
  if (completedAction.type === "reply_received") {
    // Most important: did they reply positively?
    const replyAnalysis = await analyzeReplyIntelligently({
      emailBody: completedAction.metadata.emailBody as string,
      emailSubject: completedAction.metadata.emailSubject as string,
      senderName: leadData.firstName,
      originalEmailSubject: completedAction.metadata.originalSubject as string,
      leadProfile: {
        title: leadData.title,
        company: leadData.company,
      },
    });

    // Update lead score based on outcome
    await updateLeadScore(leadData.id, replyAnalysis.classification);

    // Learn from this interaction
    if (replyAnalysis.classification === "positive") {
      await recordSuccessfulPattern({
        leadCharacteristics: leadData,
        successFactors: {
          emailSequenceUsed: completedAction.metadata.sequenceNumber,
          leadScore: completedAction.metadata.leadScore,
          psychology: completedAction.metadata.psychology,
        },
      });
    } else if (replyAnalysis.classification === "objection") {
      await recordObjectionPattern({
        objectionType: replyAnalysis.objectionAnalysis?.type || "unknown",
        leadProfile: leadData,
        objectionContent: completedAction.metadata.emailBody as string,
      });
    }
  }

  if (completedAction.type === "call_booked") {
    // Ultimate success metric
    await recordPipelineSuccess({
      leadId: completedAction.leadId,
      stage: "call_booked",
      emailsRequired: completedAction.metadata.emailCount as number,
    });
  }
}

/**
 * DYNAMIC STRATEGY RECOMMENDER
 *
 * Based on historical performance with similar leads,
 * recommend the best approach for a NEW lead
 */
export async function recommendStrategy(lead: {
  company: string;
  title: string;
  companySize?: string;
  email: string;
}): Promise<{
  strategy: string;
  confidence: number;
  reasoning: string;
  historicalPerformance: {
    successRate: number;
    avgEmailsToConversion: number;
    commonObjections: string[];
  };
}> {
  // Query historical data: which strategies worked for similar leads?
  const similarLeads = await pgQuery(
    `
    SELECT
      ed.strategy,
      COUNT(*) as total_sends,
      SUM(CASE WHEN ir.classification = 'positive' THEN 1 ELSE 0 END) as positive_responses,
      AVG(CASE WHEN ed.sequenceNumber IS NOT NULL THEN ed.sequenceNumber ELSE 0 END) as avg_emails_needed
    FROM "EmailDraft" ed
    LEFT JOIN "IncomingReply" ir ON ed.leadId = ir.leadId
    LEFT JOIN "ResearchedLead" rl ON ed.leadId = rl.id
    WHERE rl.title ILIKE $1
      OR rl.company ILIKE $2
    GROUP BY ed.strategy
    ORDER BY positive_responses DESC
    LIMIT 5
    `,
    [`%${lead.title}%`, `%${lead.company.split(" ")[0]}%`]
  );

  if (similarLeads.length === 0) {
    return {
      strategy: "CONSULTATIVE",
      confidence: 0.5,
      reasoning:
        "No historical data for this lead profile. Using default consultative approach. Will learn from this interaction.",
      historicalPerformance: {
        successRate: 0,
        avgEmailsToConversion: 0,
        commonObjections: [],
      },
    };
  }

  const topStrategy = similarLeads[0];
  const successRate = topStrategy.positive_responses / topStrategy.total_sends;
  const confidence = Math.min(0.95, Math.max(0.5, successRate));

  return {
    strategy: topStrategy.strategy,
    confidence,
    reasoning: `Based on ${topStrategy.total_sends} similar leads, this strategy had ${Math.round(successRate * 100)}% success rate.`,
    historicalPerformance: {
      successRate,
      avgEmailsToConversion: topStrategy.avg_emails_needed || 2,
      commonObjections: [], // Would fetch from objection patterns table
    },
  };
}

/**
 * LEAD CONVERSATION STATE TRACKER
 *
 * Instead of: "Did they reply?"
 * We track: "What's the CURRENT state of this relationship?"
 */
export async function updateLeadConversationState(leadId: string): Promise<{
  stage: "cold" | "warm" | "interested" | "objecting" | "negotiating" | "ready_to_book" | "inactive";
  lastInteraction: Date;
  nextAction: string;
  conversationMomentum: number; // -10 to +10
}> {
  // Fetch all interactions with this lead
  const interactions = await pgQuery(
    `
    SELECT
      ed.sentAt,
      ed.subject,
      ir.classification,
      ir.sentiment,
      ir.receivedAt
    FROM "EmailDraft" ed
    LEFT JOIN "IncomingReply" ir ON ed.leadId = ir.leadId
    WHERE ed.leadId = $1
    ORDER BY COALESCE(ir.receivedAt, ed.sentAt) DESC
    LIMIT 10
    `,
    [leadId]
  );

  if (interactions.length === 0) {
    return {
      stage: "cold",
      lastInteraction: new Date(),
      nextAction: "Send initial hook email",
      conversationMomentum: 0,
    };
  }

  // Analyze momentum
  let momentum = 0;
  let stage: "cold" | "warm" | "interested" | "objecting" | "negotiating" | "ready_to_book" | "inactive" =
    "warm";

  const latestReply = interactions.find((i) => i.classification);
  if (latestReply) {
    if (latestReply.classification === "positive") {
      stage = "ready_to_book";
      momentum = 10;
    } else if (latestReply.classification === "objection") {
      stage = "objecting";
      momentum = 5;
    } else if (latestReply.classification === "question") {
      stage = "interested";
      momentum = 7;
    } else if (latestReply.classification === "rejection") {
      stage = "inactive";
      momentum = -10;
    }
  }

  // Check if stale
  const lastInteractionDate = new Date(interactions[0].receivedAt || interactions[0].sentAt);
  const daysSinceLastInteraction = (Date.now() - lastInteractionDate.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceLastInteraction > 14) {
    momentum -= 5; // Stale conversation
    stage = "inactive";
  }

  let nextAction = "No action needed";
  if (stage === "cold") nextAction = "Send warm opening email";
  if (stage === "interested") nextAction = "Send detailed value email";
  if (stage === "objecting") nextAction = "Address objection with custom response";
  if (stage === "ready_to_book") nextAction = "Send calendar link or call to action";
  if (stage === "inactive") nextAction = "Archive and reactivate in 3 months";

  return {
    stage,
    lastInteraction: lastInteractionDate,
    nextAction,
    conversationMomentum: momentum,
  };
}

/**
 * PATTERN LEARNER
 *
 * Record what worked so we can repeat success
 */
async function recordSuccessfulPattern(context: {
  leadCharacteristics: any;
  successFactors: {
    emailSequenceUsed: number;
    leadScore: number;
    psychology: string;
  };
}) {
  // Insert into learning table
  await pgQuery(
    `
    INSERT INTO "AutomationLearning"
      (lead_title, lead_company_size, psychology_used, emails_required, success)
    VALUES ($1, $2, $3, $4, true)
    `,
    [
      context.leadCharacteristics.title,
      context.leadCharacteristics.companyTeamSize,
      context.successFactors.psychology,
      context.successFactors.emailSequenceUsed,
    ]
  );

  console.log("[Learning] Recorded successful pattern:", context.successFactors.psychology);
}

/**
 * OBJECTION PATTERN ANALYZER
 *
 * Track common objections so we get better at handling them
 */
async function recordObjectionPattern(context: {
  objectionType: string;
  leadProfile: any;
  objectionContent: string;
}) {
  await pgQuery(
    `
    INSERT INTO "ObjectionPatterns"
      (objection_type, lead_title, objection_text, frequency)
    VALUES ($1, $2, $3, 1)
    ON CONFLICT (objection_type, lead_title)
    DO UPDATE SET frequency = frequency + 1
    `,
    [context.objectionType, context.leadProfile.title, context.objectionContent]
  );

  console.log("[Learning] Recorded objection pattern:", context.objectionType);
}

/**
 * PIPELINE SUCCESS TRACKER
 *
 * Ultimate metric: did this lead convert to a call/meeting?
 */
async function recordPipelineSuccess(context: {
  leadId: string;
  stage: "call_booked" | "deal_closed";
  emailsRequired: number;
}) {
  await pgQuery(
    `
    UPDATE "ResearchedLead"
    SET
      status = $1,
      last_stage_reached = $2,
      emails_to_conversion = $3,
      updated_at = NOW()
    WHERE id = $4
    `,
    ["CONVERTED", context.stage, context.emailsRequired, context.leadId]
  );

  console.log("[Learning] Pipeline success recorded:", { stage: context.stage, emailsRequired: context.emailsRequired });
}

/**
 * LEAD SCORE UPDATER
 *
 * Adjust initial score based on actual performance
 */
async function updateLeadScore(leadId: string, outcome: string) {
  const scoreAdjustments: Record<string, number> = {
    positive: 20,
    question: 10,
    objection: -5, // Not negative, just recalibrating
    rejection: -15,
    out_of_office: 0, // Neutral
  };

  const adjustment = scoreAdjustments[outcome] || 0;

  if (adjustment !== 0) {
    await pgQuery(
      `
      UPDATE "ResearchedLead"
      SET initial_score = initial_score + $1
      WHERE id = $2
      `,
      [adjustment, leadId]
    );
  }
}

/**
 * ANOMALY DETECTOR
 *
 * Identify unusual patterns that need human attention
 */
export async function detectAnomalies(): Promise<
  Array<{
    anomalyType: string;
    severity: "low" | "medium" | "high";
    description: string;
    affectedLeads: number;
  }>
> {
  const anomalies = [];

  // 1. Unusually high bounce rate for recent sends
  const [bounceData] = await pgQuery(
    `
    SELECT
      COUNT(*) as total_sends,
      SUM(CASE WHEN ir.classification = 'rejection' THEN 1 ELSE 0 END) as rejections,
      (SUM(CASE WHEN ir.classification = 'rejection' THEN 1 ELSE 0 END)::float / COUNT(*)) as rejection_rate
    FROM "EmailDraft" ed
    LEFT JOIN "IncomingReply" ir ON ed.leadId = ir.leadId
    WHERE ed.sentAt > NOW() - INTERVAL '7 days'
    `
  );

  if (bounceData.rejection_rate > 0.4) {
    anomalies.push({
      anomalyType: "high_rejection_rate",
      severity: "high",
      description: `40%+ of recent emails are being rejected. Check: sender domain reputation, email content, targeting.`,
      affectedLeads: bounceData.total_sends,
    });
  }

  // 2. Leads with no engagement after 3 emails
  const [disengagedData] = await pgQuery(
    `
    SELECT COUNT(*) as count
    FROM "ResearchedLead" rl
    WHERE (
      SELECT COUNT(*) FROM "EmailDraft" WHERE leadId = rl.id
    ) >= 3
    AND NOT EXISTS (
      SELECT 1 FROM "IncomingReply" WHERE leadId = rl.id
    )
    `
  );

  if (disengagedData.count > 10) {
    anomalies.push({
      anomalyType: "high_disengagement",
      severity: "medium",
      description: "10+ leads getting 3+ emails with zero engagement. May indicate list quality issue.",
      affectedLeads: disengagedData.count,
    });
  }

  // 3. Emails from same domain being flagged as spam
  const [spamData] = await pgQuery(
    `
    SELECT
      SUBSTRING(rl.email FROM '@(.*)$') as domain,
      COUNT(*) as count
    FROM "IncomingReply" ir
    JOIN "ResearchedLead" rl ON ir.leadId = rl.id
    WHERE ir.classification = 'rejection'
      AND ir.emailBody ILIKE '%spam%' OR ir.emailBody ILIKE '%blocked%'
    GROUP BY domain
    HAVING COUNT(*) > 3
    `
  );

  if (spamData.length > 0) {
    anomalies.push({
      anomalyType: "domain_being_blocked",
      severity: "high",
      description: `Domain ${spamData[0].domain} being marked as spam. Urgent: warm up domain or use different sender.`,
      affectedLeads: spamData[0].count,
    });
  }

  return anomalies;
}

/**
 * AUTO-IMPROVEMENT SUGGESTION ENGINE
 *
 * Based on data, suggest tactical improvements
 */
export async function suggestImprovements(): Promise<
  Array<{
    category: string;
    suggestion: string;
    expectedImprovement: string;
    priority: "high" | "medium" | "low";
    implementation: string;
  }>
> {
  const suggestions = [];

  // 1. Best performing psychology approach
  const [bestPsychology] = await pgQuery(
    `
    SELECT
      psychology,
      COUNT(*) as uses,
      SUM(CASE WHEN outcome = 'positive' THEN 1 ELSE 0 END)::float / COUNT(*) as success_rate
    FROM "AutomationLearning"
    GROUP BY psychology
    ORDER BY success_rate DESC
    LIMIT 1
    `
  );

  if (bestPsychology?.success_rate > 0.35) {
    suggestions.push({
      category: "Email Strategy",
      suggestion: `"${bestPsychology.psychology}" psychology is working best (${Math.round(bestPsychology.success_rate * 100)}% success rate).`,
      expectedImprovement: "Use this psychology for similar leads to improve response rate by 15-25%",
      priority: "high",
      implementation:
        "Update email generation to prioritize this psychology for similar lead profiles (title, company size)",
    });
  }

  // 2. Best sending day/time
  const [bestTiming] = await pgQuery(
    `
    SELECT
      EXTRACT(DOW FROM ed.sentAt) as day_of_week,
      EXTRACT(HOUR FROM ed.sentAt) as hour,
      COUNT(*) as sends,
      SUM(CASE WHEN ir.classification IN ('positive', 'question') THEN 1 ELSE 0 END)::float / COUNT(*) as engagement_rate
    FROM "EmailDraft" ed
    LEFT JOIN "IncomingReply" ir ON ed.leadId = ir.leadId
    WHERE ed.sentAt > NOW() - INTERVAL '30 days'
    GROUP BY day_of_week, hour
    ORDER BY engagement_rate DESC
    LIMIT 1
    `
  );

  if (bestTiming?.engagement_rate > 0.25) {
    const dayName = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
      bestTiming.day_of_week
    ];
    suggestions.push({
      category: "Send Timing",
      suggestion: `Emails sent on ${dayName}s at ${bestTiming.hour}:00 have ${Math.round(bestTiming.engagement_rate * 100)}% engagement.`,
      expectedImprovement: "Move all sends to optimal timing to increase engagement by 20-30%",
      priority: "medium",
      implementation: `Schedule email sends for ${dayName}s at ${bestTiming.hour}:00 UTC`,
    });
  }

  // 3. Lead qualification improvement
  const [qualityIssue] = await pgQuery(
    `
    SELECT
      CASE
        WHEN initial_score < 50 THEN 'Low quality leads'
        WHEN initial_score BETWEEN 50 AND 75 THEN 'Medium quality leads'
        ELSE 'High quality leads'
      END as quality_bucket,
      COUNT(*) as count,
      SUM(CASE WHEN status = 'CONVERTED' THEN 1 ELSE 0 END)::float / COUNT(*) as conversion_rate
    FROM "ResearchedLead"
    GROUP BY quality_bucket
    ORDER BY conversion_rate DESC
    `
  );

  suggestions.push({
    category: "Lead Quality",
    suggestion: `High-quality leads (score 75+) convert ${Math.round(qualityIssue[2]?.conversion_rate * 100 || 0)}% of the time. Low-quality leads only ${Math.round(qualityIssue[0]?.conversion_rate * 100 || 0)}%.`,
    expectedImprovement: "Focus on high-quality leads to reduce wasted outreach by 40-50%",
    priority: "high",
    implementation:
      "Increase lead qualification threshold from 50 to 65. Only generate emails for higher-quality leads.",
  });

  return suggestions;
}

export default {
  processAutomationLearningLoop,
  recommendStrategy,
  updateLeadConversationState,
  detectAnomalies,
  suggestImprovements,
};

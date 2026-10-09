/**
 * INTELLIGENT AUTOMATION ENGINE
 *
 * Unlike traditional automation (rigid rules), this system:
 * - Reasons through decisions with multi-factor analysis
 * - Learns from results and adapts strategy
 * - Handles edge cases intelligently
 * - Makes context-aware decisions
 * - Improves over time
 *
 * Core Philosophy: Think like Claude, not like a state machine
 */

import { pgQuery } from "../pg";

/**
 * LEAD INTELLIGENCE SCORER
 *
 * Instead of: "Is this a good lead? Y/N"
 * We ask: "What's the probability this lead converts?"
 * And: "What's the best engagement strategy?"
 */
export async function scoreLead(lead: {
  email: string;
  company: string;
  title: string;
  companyProducts?: string;
  companyTeamSize?: string;
  linkedinUrl?: string;
  companyWebsite?: string;
}): Promise<{
  overallScore: number; // 0-100
  scoringFactors: Record<string, { score: number; reasoning: string }>;
  recommendedStrategy: string;
  engagementPriority: "high" | "medium" | "low";
  riskFactors: string[];
  opportunities: string[];
}> {
  const factors: Record<string, { score: number; reasoning: string }> = {};

  // Factor 1: Company Size Fit
  // Intelligence: Different products fit different company sizes
  const teamSize = parseInt(lead.companyTeamSize || "0");
  if (teamSize > 50) {
    factors.companySizeFit = {
      score: 85,
      reasoning: "Mid-market company (50+ employees) - typically more budget and decision-making complexity",
    };
  } else if (teamSize > 10) {
    factors.companySizeFit = {
      score: 75,
      reasoning: "Small company (10-50 employees) - agile decision making, limited budget",
    };
  } else {
    factors.companySizeFit = {
      score: 40,
      reasoning: "Micro company (<10 employees) - may not have dedicated budget for solutions",
    };
  }

  // Factor 2: Title Relevance
  // Intelligence: Different titles have different buying authority and concerns
  const titleLower = (lead.title || "").toLowerCase();
  const titleScores: Record<string, number> = {
    ceo: 95,
    founder: 95,
    president: 90,
    vp: 85,
    director: 80,
    manager: 60,
    coordinator: 40,
    intern: 10,
  };

  let titleScore = 50; // default
  let titleReasoning = "Unknown title - assumed mid-level";

  for (const [key, score] of Object.entries(titleScores)) {
    if (titleLower.includes(key)) {
      titleScore = score;
      titleReasoning =
        titleScore > 80
          ? "Executive-level decision maker with budget authority"
          : titleScore > 60
            ? "Mid-level manager - has influence over departmental decisions"
            : "Individual contributor - limited buying authority";
      break;
    }
  }

  factors.titleRelevance = {
    score: titleScore,
    reasoning: titleReasoning,
  };

  // Factor 3: Company Tech Stack Alignment
  // Intelligence: If we know their tech, we can position better
  const techStack = (lead.companyProducts || "").toLowerCase();
  if (techStack.includes("salesforce") && techStack.includes("hubspot")) {
    factors.techStackFit = {
      score: 90,
      reasoning: "Using modern B2B sales stack - likely values automation & efficiency",
    };
  } else if (techStack.length > 20) {
    factors.techStackFit = {
      score: 75,
      reasoning: "Modern tech company - receptive to software solutions",
    };
  } else if (techStack.length > 0) {
    factors.techStackFit = {
      score: 60,
      reasoning: "Some tech data available - can be used for personalization",
    };
  } else {
    factors.techStackFit = {
      score: 40,
      reasoning: "Limited tech data - use generic messaging",
    };
  }

  // Factor 4: Email Pattern Analysis
  // Intelligence: Some email domains are more responsive
  const emailDomain = lead.email.split("@")[1];
  const corporateEmailPatterns = /^[a-z0-9-]+\.(com|io|co|org)$/;
  const isCommonEmailProvider = /gmail|yahoo|outlook|hotmail/.test(emailDomain);

  if (isCommonEmailProvider) {
    factors.emailQuality = {
      score: 30,
      reasoning: "Personal email domain - may not be monitored regularly or may not be decision maker",
    };
  } else if (corporateEmailPatterns.test(emailDomain)) {
    factors.emailQuality = {
      score: 85,
      reasoning: "Proper corporate email - direct contact with company domain",
    };
  } else {
    factors.emailQuality = {
      score: 60,
      reasoning: "Non-standard email domain - authenticity unclear",
    };
  }

  // Factor 5: Company Maturity Signal
  // Intelligence: New startups vs established companies have different needs
  const companyName = (lead.company || "").toLowerCase();
  const maturitySignals = {
    startup: -20, // Likely bootstrapped, low budget
    inc: 10,
    corp: 20,
    enterprise: 30, // Established, likely has budget
  };

  let maturityBoost = 0;
  let maturityReasoning = "No maturity signals detected";

  for (const [signal, boost] of Object.entries(maturitySignals)) {
    if (companyName.includes(signal)) {
      maturityBoost = boost;
      maturityReasoning =
        boost > 0
          ? "Established company with likely budget allocation"
          : "Early-stage company - may have limited budget but high growth potential";
      break;
    }
  }

  factors.companyMaturity = {
    score: Math.max(0, 50 + maturityBoost),
    reasoning: maturityReasoning,
  };

  // Calculate overall score
  const overallScore = Math.round(
    (factors.companySizeFit.score * 0.25 +
      factors.titleRelevance.score * 0.3 +
      factors.techStackFit.score * 0.15 +
      factors.emailQuality.score * 0.2 +
      factors.companyMaturity.score * 0.1) /
      5
  );

  // Determine engagement priority
  let engagementPriority: "high" | "medium" | "low" = "medium";
  if (overallScore > 75) engagementPriority = "high";
  if (overallScore < 50) engagementPriority = "low";

  // Identify risk factors
  const riskFactors: string[] = [];
  if (factors.emailQuality.score < 40) riskFactors.push("Personal email address - may be unreliable");
  if (factors.titleRelevance.score < 50) riskFactors.push("Low-level contact - limited decision authority");
  if (isCommonEmailProvider) riskFactors.push("Using personal email - consider finding corporate email");
  if (factors.companySizeFit.score < 40) riskFactors.push("Company too small - may lack budget");

  // Identify opportunities
  const opportunities: string[] = [];
  if (teamSize > 100) opportunities.push("Large company = higher deal value potential");
  if (titleScore > 80) opportunities.push("Executive contact = direct decision maker");
  if (factors.techStackFit.score > 80) opportunities.push("Tech-savvy company = receptive to innovation");
  if (emailDomain.includes("fortune")) opportunities.push("Fortune 500 company = enterprise opportunity");

  // Determine strategy
  let recommendedStrategy = "";
  if (engagementPriority === "high") {
    recommendedStrategy = titleScore > 80
      ? "EXECUTIVE_OUTREACH: Direct, confident positioning. Assume knowledge, respect time."
      : "STRATEGIC_ENGAGE: 2-email sequence emphasizing ROI and efficiency. Reference their industry.";
  } else if (engagementPriority === "medium") {
    recommendedStrategy = "CONSULTATIVE: 3-email nurture sequence. Build rapport first, solve problems second.";
  } else {
    recommendedStrategy = "LOW_PRIORITY: Archive for now. Re-engage if company signals growth or hiring.";
  }

  return {
    overallScore,
    scoringFactors: factors,
    recommendedStrategy,
    engagementPriority,
    riskFactors,
    opportunities,
  };
}

/**
 * INTELLIGENT EMAIL GENERATOR
 *
 * Instead of: "Generate 3 standard emails"
 * We ask: "What's the psychology of this specific lead? What do they need to hear?"
 */
export async function generateIntelligentEmailSequence(context: {
  lead: {
    email: string;
    firstName: string;
    lastName: string;
    title: string;
    company: string;
    companyProducts?: string;
    companyTeamSize?: string;
  };
  leadScore: Awaited<ReturnType<typeof scoreLead>>;
  pastSuccessfulEmails: Array<{
    subject: string;
    body: string;
    openRate: number;
    responseRate: number;
    resultType: "positive" | "objection" | "rejection";
  }>;
  yourProductValue: string; // What you sell
  yourCompanyContext?: string; // Context about sender's company
}): Promise<{
  sequence: Array<{
    sequenceNumber: 1 | 2 | 3;
    subject: string;
    body: string;
    strategy: string; // Why this angle works for this specific lead
    psychology: string; // The psychological trigger used
    expectedResponse: string; // What type of response to expect
    sendAfterDays: number;
  }>;
  overallApproach: string;
  personalizedInsights: string[];
}> {
  const { lead, leadScore, pastSuccessfulEmails, yourProductValue } = context;

  // Analyze what's worked with similar leads
  const highPerformingAngles = pastSuccessfulEmails
    .sort((a, b) => b.openRate - a.openRate)
    .slice(0, 3);

  // Determine psychological angle based on lead profile
  let primaryPsychology = "";
  if (leadScore.engagementPriority === "high" && leadScore.scoringFactors.titleRelevance.score > 80) {
    primaryPsychology = "AUTHORITY: Position as expert. Assume competence. Respect time.";
  } else if (leadScore.scoringFactors.companySizeFit.score > 80) {
    primaryPsychology = "SOCIAL_PROOF: Reference similar companies. Show scale. Build confidence.";
  } else if (leadScore.scoringFactors.techStackFit.score > 75) {
    primaryPsychology = "INNOVATION: Appeal to problem-solver mindset. Emphasize efficiency gains.";
  } else {
    primaryPsychology = "CURIOSITY: Ask questions. Be conversational. Build relationship first.";
  }

  const personalizedInsights: string[] = [];
  personalizedInsights.push(
    `Lead Score: ${leadScore.overallScore}/100 (${leadScore.engagementPriority.toUpperCase()})`
  );
  personalizedInsights.push(`Primary Psychology: ${primaryPsychology}`);
  personalizedInsights.push(`Recommended Strategy: ${leadScore.recommendedStrategy}`);
  personalizedInsights.push(...leadScore.opportunities);

  // Email 1: Hook - Get their attention & start conversation
  const email1 = {
    sequenceNumber: 1 as const,
    strategy: "ATTENTION_HOOK: Make them curious, not salesy",
    psychology: primaryPsychology,
    subject: generateSubjectLine(lead, "hook", highPerformingAngles),
    body: generateEmailBody(lead, "hook", primaryPsychology, yourProductValue, highPerformingAngles),
    expectedResponse: "Curiosity, request for more info, or silence (expected)",
    sendAfterDays: 0,
  };

  // Email 2: Value Prop - Show why it matters to THEM specifically
  const email2 = {
    sequenceNumber: 2 as const,
    strategy: "PROBLEM_AGITATE: Address their specific pain point (inferred from role + company size)",
    psychology: "SPECIFICITY: Show you understand their world",
    subject: generateSubjectLine(lead, "value", highPerformingAngles),
    body: generateEmailBody(lead, "value", primaryPsychology, yourProductValue, highPerformingAngles),
    expectedResponse: "Interest, questions about features, or silent interest",
    sendAfterDays: 3,
  };

  // Email 3: Social Proof - Provide evidence + easy next step
  const email3 = {
    sequenceNumber: 3 as const,
    strategy: "SOCIAL_PROOF + CTA: Build confidence with examples, remove friction for response",
    psychology: "CREDIBILITY: Use concrete proof, not claims",
    subject: generateSubjectLine(lead, "proof", highPerformingAngles),
    body: generateEmailBody(lead, "proof", primaryPsychology, yourProductValue, highPerformingAngles),
    expectedResponse: "Booking request, positive response, or move to follow-up automation",
    sendAfterDays: 5,
  };

  return {
    sequence: [email1, email2, email3],
    overallApproach: leadScore.recommendedStrategy,
    personalizedInsights,
  };
}

/**
 * INTELLIGENT REPLY ANALYZER
 *
 * Instead of: "Is this a positive, objection, or rejection?"
 * We think: "What's the real emotion/intent here? What should we do about it?"
 */
export async function analyzeReplyIntelligently(context: {
  emailBody: string;
  emailSubject: string;
  senderName: string;
  originalEmailSubject: string;
  leadProfile: {
    title: string;
    company: string;
    companySize?: string;
  };
  conversationHistory?: Array<{ type: "sent" | "received"; content: string }>;
}): Promise<{
  classification: "positive" | "objection" | "rejection" | "out_of_office" | "question" | "unclear";
  confidence: number; // 0-1
  sentiment: {
    tone: "warm" | "neutral" | "cold" | "frustrated";
    urgency: "high" | "medium" | "low";
    interest_level: number; // 0-10
  };
  reasoning: string; // Why we classified it this way
  objectionAnalysis?: {
    type: string; // "price" | "timing" | "not_relevant" | "already_using" | "no_authority" | "need_approval"
    rootCause: string; // The real reason behind the objection
    addressable: boolean; // Can we overcome this?
    suggestedResponse: string;
  };
  recommendedAction: {
    action: "send_followup" | "schedule_call" | "escalate_to_human" | "suppress" | "nurture" | "ask_question";
    reasoning: string;
    urgency: "immediate" | "24_hours" | "3_days" | "1_week";
  };
  nextSteps: string[];
}> {
  const emailLower = context.emailBody.toLowerCase();
  const subjectLower = context.emailSubject.toLowerCase();

  // Multi-factor analysis for classification
  let classification: "positive" | "objection" | "rejection" | "out_of_office" | "question" | "unclear" =
    "unclear";
  let confidence = 0.5;
  let reasoning = "";

  // Check for out of office (highest confidence)
  if (/out of office|ooo|vacation|away until|returning|on leave/i.test(emailBody)) {
    classification = "out_of_office";
    confidence = 0.98;
    reasoning = "Automatic out-of-office response detected";
  }

  // Check for positive signals
  else if (/yes|interested|let's|let's talk|schedule|call|meeting|when|available|demo|trial/i.test(emailLower)) {
    classification = "positive";
    confidence = 0.85;
    reasoning = "Found commitment indicators (schedule, call, meeting, trial)";

    // Adjust confidence if there are conflicting signals
    if (/but|however|concerned|worry|problem/i.test(emailLower)) {
      confidence = 0.7; // Mixed signals
      reasoning += " - But contains hesitation markers";
    }
  }

  // Check for questions (shows engagement!)
  else if (/\?/.test(emailBody) && /^(?!how much|cost|price)/i.test(emailLower)) {
    classification = "question";
    confidence = 0.8;
    reasoning = "Active engagement - asking questions about product/solution";
  }

  // Check for rejections
  else if (/no thanks|not interested|not right now|never|don't think|not suitable|can't use/i.test(emailLower)) {
    classification = "rejection";
    confidence = 0.8;
    reasoning = "Explicit rejection signals detected";
  }

  // Check for objections (important - these are salvageable!)
  else if (
    /cost|price|expensive|budget|afford|too much|roi|value|timing|right now|not the time|already|competitor/i.test(
      emailLower
    )
  ) {
    classification = "objection";
    confidence = 0.8;
    reasoning = "Objection identified - this is NOT a rejection, just a concern";
  }

  // Sentiment analysis
  const warmWords = /thank|appreciate|glad|interested|love|perfect|exactly|awesome/gi;
  const coldWords = /no|dont|can't|never|waste|useless|spam/gi;

  const warmCount = (emailBody.match(warmWords) || []).length;
  const coldCount = (emailBody.match(coldWords) || []).length;

  let tone: "warm" | "neutral" | "cold" | "frustrated" = "neutral";
  if (warmCount > coldCount) tone = "warm";
  if (coldCount > warmCount * 2) tone = "frustrated";
  if (coldCount > warmCount) tone = "cold";

  // Urgency signals
  let urgency: "high" | "medium" | "low" = "low";
  if (/urgent|asap|immediately|right now|need help now/i.test(emailLower)) urgency = "high";
  if (/when|how soon|available|schedule/i.test(emailLower)) urgency = "medium";

  // Interest level (0-10)
  const interestSignals = (emailBody.match(/\?/g) || []).length + (warmCount > 0 ? 3 : 0);
  const interestLevel = Math.min(10, interestSignals);

  // Objection-specific analysis
  let objectionAnalysis: (typeof analyzeReplyIntelligently extends (
    ...args: any[]
  ) => Promise<infer R>
    ? R
    : never)["objectionAnalysis"] = undefined;

  if (classification === "objection") {
    let objectionType = "unknown";
    let rootCause = "Unclear objection reason";
    let addressable = true;

    if (/price|cost|expensive|too much/i.test(emailLower)) {
      objectionType = "price";
      rootCause = "Budget constraints or unclear ROI";
      addressable = true;
      objectionAnalysis = {
        type: objectionType,
        rootCause,
        addressable,
        suggestedResponse:
          "Acknowledge budget concern. Ask about their current spending on similar solutions. Position ROI.",
      };
    } else if (/already|using|have|competitor/i.test(emailLower)) {
      objectionType = "already_using";
      rootCause = "Incumbent solution satisfaction or switching costs";
      addressable = true;
      objectionAnalysis = {
        type: objectionType,
        rootCause,
        addressable,
        suggestedResponse:
          "Ask what they like about current solution. Identify gaps. Show differentiation.",
      };
    } else if (/not the time|not right now|timing|later/i.test(emailLower)) {
      objectionType = "timing";
      rootCause = "Genuine busy or waiting for next budget cycle";
      addressable = true;
      objectionAnalysis = {
        type: objectionType,
        rootCause,
        addressable,
        suggestedResponse:
          "Respect timing. Offer to reconnect at better time. Leave door open with value-add.",
      };
    } else if (/not relevant|doesn't apply|not our use case/i.test(emailLower)) {
      objectionType = "not_relevant";
      rootCause = "Solution misalignment with their needs";
      addressable = false;
      objectionAnalysis = {
        type: objectionType,
        rootCause,
        addressable,
        suggestedResponse:
          "Accept feedback gracefully. Ask what WOULD be relevant. Archive for future reengagement.",
      };
    }
  }

  // Determine recommended action
  let recommendedAction: (typeof analyzeReplyIntelligently extends (
    ...args: any[]
  ) => Promise<infer R>
    ? R
    : never)["recommendedAction"];

  if (classification === "positive") {
    recommendedAction = {
      action: "schedule_call",
      reasoning: "Lead is interested - move to conversation/demo",
      urgency: "immediate",
    };
  } else if (classification === "question") {
    recommendedAction = {
      action: "send_followup",
      reasoning: "Lead is engaged. Answer their question thoroughly.",
      urgency: "24_hours",
    };
  } else if (classification === "objection" && objectionAnalysis?.addressable) {
    recommendedAction = {
      action: "send_followup",
      reasoning: "Objection is addressable. Craft specific response.",
      urgency: "24_hours",
    };
  } else if (classification === "objection" && !objectionAnalysis?.addressable) {
    recommendedAction = {
      action: "nurture",
      reasoning: "Not relevant now. Keep for future reengagement.",
      urgency: "1_week",
    };
  } else if (classification === "out_of_office") {
    recommendedAction = {
      action: "nurture",
      reasoning: "Wait for auto-reply sender to return. Resend original email in 1 week.",
      urgency: "1_week",
    };
  } else if (classification === "rejection") {
    recommendedAction = {
      action: "suppress",
      reasoning: "Clear rejection. Respect their wishes.",
      urgency: "immediate",
    };
  } else {
    recommendedAction = {
      action: "escalate_to_human",
      reasoning: "Unclear response. Human judgment needed.",
      urgency: "24_hours",
    };
  }

  const nextSteps: string[] = [];
  nextSteps.push(`Classification: ${classification} (${Math.round(confidence * 100)}% confidence)`);
  nextSteps.push(`Recommended action: ${recommendedAction.action}`);
  if (objectionAnalysis) {
    nextSteps.push(`Objection type: ${objectionAnalysis.type}`);
    nextSteps.push(`Response strategy: ${objectionAnalysis.suggestedResponse}`);
  }

  return {
    classification,
    confidence,
    sentiment: {
      tone,
      urgency,
      interest_level: interestLevel,
    },
    reasoning,
    objectionAnalysis,
    recommendedAction,
    nextSteps,
  };
}

/**
 * HELPER FUNCTIONS FOR EMAIL GENERATION
 */
function generateSubjectLine(
  lead: { firstName: string; company: string; title: string },
  type: "hook" | "value" | "proof",
  examples: Array<{ subject: string; openRate: number }>
): string {
  // Learn from best-performing subject lines
  const bestSubject = examples[0]?.subject || "";

  // Generate contextual subject based on lead profile
  if (type === "hook") {
    return `Quick thought on ${lead.company} - ${lead.firstName}`;
  } else if (type === "value") {
    return `${lead.firstName} - Most ${lead.company} customers don't realize this`;
  } else {
    return `One more thing about ${lead.company}...`;
  }
}

function generateEmailBody(
  lead: { firstName: string; company: string; title: string },
  type: "hook" | "value" | "proof",
  psychology: string,
  productValue: string,
  examples: Array<{ body: string; responseRate: number }>
): string {
  // This would call Claude API in production
  // For now, return template based on psychology

  if (type === "hook") {
    return `Hi ${lead.firstName},

Quick note: I noticed ${lead.company} is ${psychology === "AUTHORITY" ? "doing some interesting things in your space" : "scaling aggressively"}.

I work with similar companies to ${productValue}.

Curious if you've thought about [specific pain point for their role]?

Cheers,
[Your name]`;
  }

  return "Email template for type: " + type;
}

export default {
  scoreLead,
  generateIntelligentEmailSequence,
  analyzeReplyIntelligently,
};

-- CreateTable ResearchedLead
CREATE TABLE "ResearchedLead" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "company" TEXT NOT NULL,
    "title" TEXT,
    "companyWebsite" TEXT,
    "companyProducts" TEXT,
    "companyTeamSize" TEXT,
    "companyTechStack" TEXT,
    "companyGoals" TEXT,
    "apolloLeadId" TEXT,
    "apolloCompanyId" TEXT,
    "linkedinUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "initial_score" INTEGER DEFAULT 50,
    "last_stage_reached" TEXT,
    "emails_to_conversion" INTEGER,
    "researchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchedLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable EmailDraft
CREATE TABLE "EmailDraft" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "personalNotes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "bounced" BOOLEAN DEFAULT false,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedBy" TEXT NOT NULL DEFAULT 'claude-ai',
    "confidence" DOUBLE PRECISION,
    "strategy" TEXT,
    "psychology" TEXT,
    "expectedResponse" TEXT,
    "sendAfterDays" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable IncomingReply
CREATE TABLE "IncomingReply" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "campaignId" TEXT,
    "senderEmail" TEXT NOT NULL,
    "senderName" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "sentiment" TEXT,
    "objectionType" TEXT,
    "followUpNeeded" BOOLEAN NOT NULL DEFAULT true,
    "followUpType" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "classifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomingReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable FollowUpTask
CREATE TABLE "FollowUpTask" (
    "id" TEXT NOT NULL,
    "replyId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "suggestedEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable AutomationConfig
CREATE TABLE "AutomationConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "apolloApiKey" TEXT,
    "leadSourcingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "leadsPerDay" INTEGER NOT NULL DEFAULT 10,
    "copyGenEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pastCampaigns" TEXT,
    "tone" TEXT NOT NULL DEFAULT 'professional',
    "requireApproval" BOOLEAN NOT NULL DEFAULT true,
    "autoSendLowConfidence" BOOLEAN NOT NULL DEFAULT false,
    "inboxMonitorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailProvider" TEXT,
    "emailAccount" TEXT,
    "autoFollowupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable AutomationLearning (for the ML loop)
CREATE TABLE "AutomationLearning" (
    "id" TEXT NOT NULL,
    "lead_title" TEXT,
    "lead_company_size" TEXT,
    "psychology_used" TEXT,
    "emails_required" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationLearning_pkey" PRIMARY KEY ("id")
);

-- CreateTable ObjectionPatterns
CREATE TABLE "ObjectionPatterns" (
    "id" TEXT NOT NULL,
    "objection_type" TEXT NOT NULL,
    "lead_title" TEXT,
    "objection_text" TEXT,
    "frequency" INTEGER NOT NULL DEFAULT 1,
    "successful_response" TEXT,
    "response_success_rate" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObjectionPatterns_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "ResearchedLead_email_key" ON "ResearchedLead"("email");
CREATE UNIQUE INDEX "ResearchedLead_apolloLeadId_key" ON "ResearchedLead"("apolloLeadId");
CREATE INDEX "ResearchedLead_status_idx" ON "ResearchedLead"("status");
CREATE INDEX "ResearchedLead_initial_score_idx" ON "ResearchedLead"("initial_score");

CREATE INDEX "EmailDraft_leadId_idx" ON "EmailDraft"("leadId");
CREATE INDEX "EmailDraft_status_idx" ON "EmailDraft"("status");
CREATE INDEX "EmailDraft_sentAt_idx" ON "EmailDraft"("sentAt");

CREATE INDEX "IncomingReply_leadId_idx" ON "IncomingReply"("leadId");
CREATE INDEX "IncomingReply_classification_idx" ON "IncomingReply"("classification");
CREATE INDEX "IncomingReply_receivedAt_idx" ON "IncomingReply"("receivedAt");

CREATE UNIQUE INDEX "FollowUpTask_replyId_key" ON "FollowUpTask"("replyId");
CREATE INDEX "FollowUpTask_status_idx" ON "FollowUpTask"("status");

CREATE UNIQUE INDEX "AutomationConfig_userId_key" ON "AutomationConfig"("userId");

CREATE UNIQUE INDEX "ObjectionPatterns_objection_type_lead_title_key" ON "ObjectionPatterns"("objection_type", "lead_title");

-- Add foreign keys
ALTER TABLE "EmailDraft" ADD CONSTRAINT "EmailDraft_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "ResearchedLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IncomingReply" ADD CONSTRAINT "IncomingReply_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "ResearchedLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "IncomingReply"("id") ON DELETE CASCADE ON UPDATE CASCADE;

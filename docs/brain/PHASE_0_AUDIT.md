# PHASE 0 AUDIT — Ground Truth Discovery Report

**Date**: 2026-11-11  
**Target Test Environment**: Replica 3 (`adlwwkqgexykuhkdkpfu`, `ap-southeast-1`, 100% synced with Primary `hsmudwkfwmvinhtggxyd`)

---

## 1.1 Schema Reality

### Phantom Models Referenced in `server/automation/orchestrator.ts`
- **Prisma Schema Check (`nexus-outbound/prisma/schema.prisma`)**: None of `AutomationConfig`, `AutomationLearning`, `ObjectionPatterns`, `ResearchedLead`, `EmailDraft`, `IncomingReply`, or `FollowUpTask` exist in `schema.prisma`.
- **Live PostgreSQL Check (`information_schema.tables`)**: `0` rows returned. None of these 7 tables exist in the database. `server/automation/orchestrator.ts` and `api/automation/index.ts` reference non-existent tables (`ResearchedLead`, `EmailDraft`, `IncomingReply`, `AutomationLearning`, `ObjectionPatterns`).
- **Existing Draft Table**: `AiDraft` exists in `schema.prisma` and PostgreSQL (`0` rows currently).

### `Brand` Model Ground Truth (`nexus-outbound/prisma/schema.prisma` & Live DB)
Columns present on `Brand` (`14,960` rows):
`id`, `domain` (unique), `name`, `totalContacts`, `cleanContacts`, `burnedContacts`, `repliedContacts`, `lastContactedAt`, `daysSinceLastContact`, `recencyBucket`, `outreachState`, `tags` (`text[]`), `createdAt`, `updatedAt`.
- **Does `Brand.tier` exist?** **NO.** Must be added as an optional column (`tier String?`) on `Brand` in the additive migration, or derived from `totalContacts` / `tags`.
- **Does `Brand.categoryKey` exist?** **NO.** Must be added as an optional column (`categoryKey String?`) on `Brand` in the additive migration.
- **Is there a per-brand contact cap field?** **NO.** Only aggregate counters (`totalContacts`, `cleanContacts`, `burnedContacts`, `repliedContacts`) exist.

### `Lead` Model Ground Truth (`nexus-outbound/prisma/schema.prisma` & Live DB)
Columns present on `Lead` (`51,474` rows):
`id`, `campaignId`, `email`, `firstName`, `lastName`, `source`, `customData` (`jsonb`), `leadCategory` (`LeadCategory` enum: `UNCATEGORIZED`, `WORKING`, `NOT_WORKING`, `POTENTIAL`, `DO_NOT_CONTACT`), `status` (`LeadStatus` enum: `ACTIVE`, `REPLIED`, `UNSUBSCRIBED`, `BOUNCED`), `lastStepSent`, `aiSentiment` (`Sentiment` enum: `INTERESTED`, `NOT_INTERESTED`, `WRONG_PERSON`), `providerLeadId`, `brandId`, `domain`, `lastMessageId`, `lastMessageAt`, `lastSubject`, `lastBodyHook`, `lastSender`, `lastCampaign`, `lastOutcome`, `totalMessages`, `totalOutbound`, `totalInbound`, `totalReplied`, `totalBounced`, `totalSpam`, `firstContactedAt`, `lastContactedAt`, `lastDeliveredAt`, `lastRepliedAt`, `lastBouncedAt`, `daysSinceFirstContact`, `daysSinceLastContact`, `daysSinceLastReply`, `contactFrequencyDays`, `recencyBucket` (`RecencyBucket`), `outreachState` (`OutreachState`), `isBurned`, `isDormant`, `isReengagementCandidate`, `replyClassification` (`ReplyClass`), `tags`, `intelligenceUpdatedAt`, `repliedAt`, `unsubscribedAt`, `bounceCount`, `bounceType`, `firstOpenAt`, `lastOpenAt`, `openCount`, `clickCount`, `leadScore`, `timezone`, `createdAt`, `updatedAt`.

- **Exact `Lead.outreachState` enum**:
  `BURNED | DO_NOT_CONTACT_RECENTLY | WARM_ACTIVE | WARM_STALE | IN_SEQUENCE | COLD_REENGAGEMENT | DORMANT_REPLIED | NEVER_REACHED | UNKNOWN`
- **Is there a `DRAFTED_REPLIED` value?** **NO.** The actual enum value is **`DORMANT_REPLIED`**, and `Lead.status` also has **`REPLIED`**.
- **Is there a `repliedAt` timestamp?** **YES** (`Lead.repliedAt` and `Lead.lastRepliedAt`, plus `Lead.totalReplied > 0`).
- **Are `Lead.categoryKey` and `Lead.designation` present, or `Lead.category` and `Lead.title`?**
  - Neither `category`, `title`, `categoryKey`, nor `designation` are top-level columns on `Lead` today!
  - Instead, raw category and title live inside `Lead.customData` JSONB:
    - `customData->>'category'` (`30,671` leads)
    - `customData->>'title'` (`11,262` leads) and `customData->>'role'` (`10,411` leads)
    - `customData->>'company'` (`48,591` leads) and `customData->>'company_name'` (`2,005` leads)
  - Note: `Lead.name` also does not exist as a single column; `Lead` has `firstName` and `lastName`.

### Unmapped Creator Tables Present in Live DB (Not in `schema.prisma`)
Four tables exist in PostgreSQL that are managed via raw SQL (`server/creators.ts`, `server/creator_campaigns.ts`) and are not in `nexus-outbound/prisma/schema.prisma`:
- `Creator` (`6,442` rows)
- `CreatorCampaign` (`7` rows)
- `CreatorCampaignEnrollment` (`975` rows)
- `CreatorTemplate` (`5` rows)
> **Critical Migration Rule**: Never run `prisma db push --accept-data-loss` or destructive resets, as Prisma would drop the 4 Creator tables and 22 Tally ERP tables. Use additive SQL migrations or include introspected models.

---

## 1.2 Smartlead Integration Truth

Inspected `server/smartleadSync.ts`, `server/smartleadWebhook.ts`, `server/smartleadRepliesSync.ts`, `server/sentEventsSync.ts`, and `server/smartleadKeys.ts`:

1. **Dual API Key Architecture**: The system uses `SMARTLEAD_API_KEY` (primary) and `SMARTLEAD_SECONDARY_API_KEY` (secondary account fallback) via `server/smartleadKeys.ts`.
2. **How Smartlead Webhooks Persist Data**:
   - `server/smartleadWebhook.ts` (`recordSmartleadEvent`) writes into **`EmailEvent`**, NOT `EmailMessage`.
   - `EmailEvent` columns: `id`, `leadId`, `eventType` (`'sent' | 'opened' | 'clicked' | 'replied' | 'bounced' | 'unsubscribed'`), `providerEventId` (unique), `fromEmail`, `rawPayload` (`jsonb`), `createdAt`.
   - Note: `EmailEvent` does **NOT** have `occurredAt`, `type`, `emailMessageId`, `mailboxId`, or `campaignId` columns!
     - Timestamp column is `createdAt` (not `occurredAt`).
     - Event type column is `eventType` (not `type`).
     - Mailbox is stored as `fromEmail` (string), not `mailboxId`.
     - Campaign is resolved by joining `Lead.campaignId -> Campaign.id` (or `rawPayload->>'campaign_id'`).
3. **Campaign Pause API**:
   - In `server/smartleadSync.ts`, starting a campaign uses `POST /campaigns/{id}/status` with `{ status: "START" }`, and pausing uses `{ status: "PAUSED" }`.

---

## 1.3 Reply Classification Audit

1. **Where Replies Live**:
   - Historical Apollo imports (`86,301` rows) live in `EmailMessage` (`source = 'json'`), where `replyClassification` uses the `ReplyClass` enum:
     - `NONE`: 83,543
     - `INTERESTED`: 1,460
     - `UNVERIFIED_REPLY`: 909
     - `NOT_NOW`: 159
     - `WRONG_PERSON`: 116
     - `UNSUBSCRIBE`: 63
     - `AUTO_RESPONDER`: 49
     - `OOO`: 2
   - Live Smartlead replies (`EmailEvent` where `eventType = 'replied'`) currently update `Lead.status = 'REPLIED'`, `Lead.repliedAt = NOW()`, and `Lead.leadCategory = 'WORKING'`, **without running any classifier** (`Lead.replyClassification` remains `'NONE'` on live Smartlead replies, including OOO and auto-ticket responses!).
2. **Audit Finding on `EmailMessage` Historical Labels**:
   - Inspection of recent `EmailMessage` rows labeled `INTERESTED` shows internal KYC/support threads and sender signatures mixed into `INTERESTED`, while live Smartlead replies in `EmailEvent` have OOO ("I am currently out of office", "I am on leave") and auto-responders (`[#ANKER-TNA1012622185]`) unmarked (`replyClassification = 'NONE'`).
   - **Action Required Before Slice 6**: Wire deterministic + LLM reply classification into `recordSmartleadEvent` / `syncLeadMessageHistory` to set `Lead.replyClassification` (`ReplyClass` enum: `'INTERESTED'`, `'OOO'`, `'AUTO_RESPONDER'`, `'UNSUBSCRIBE'`, `'NOT_NOW'`, `'WRONG_PERSON'`) and filter out internal addresses.

---

## 1.4 `pgvector` Extension

- **Primary (`hsmudwkfwmvinhtggxyd`)**: `vector` extension is **INSTALLED**.
- **Replica 3 (`adlwwkqgexykuhkdkpfu`)**: `vector` extension is **INSTALLED** (enabled during Phase 0 sync).
- Per Section 1.4 & Section 14, v1 will still use PostgreSQL full-text search (`to_tsvector` / `plainto_tsquery`) for `KnowledgeChunk` retrieval, keeping the architecture dependency-free.

---

## 1.5 Baseline Metrics (Last 60 Days — Corrected for Actual Schema)

Querying `EmailEvent` joined to `Lead` over the last 60 days:

| `Lead.leadCategory` | Sent (`eventType='sent'`) | Replies (`eventType='replied'`) | Bounced (`eventType='bounced'`) |
| :--- | ---: | ---: | ---: |
| `UNCATEGORIZED` | 16,159 | 11 | 400 |
| `POTENTIAL` | 10,407 | 1 | 150 |
| `WORKING` | 81 | 126 | 0 |
| **Total (60d)** | **26,647** | **138** | **550** |

*(Note: When a lead replies in `smartleadWebhook.ts`, its `leadCategory` is mutated to `'WORKING'`, which explains why 126 of the 138 replies sit in the `WORKING` row while their prior sends were recorded on leads still in `UNCATEGORIZED`/`POTENTIAL`.)*

---

## 1.6 Lead Data Quality (`51,474` Total Leads)

| Metric | Count | % of Total | Notes / Mapping |
| :--- | ---: | ---: | :--- |
| Total `Lead` rows | 51,474 | 100.0% | Synced across Primary & Replica 3 |
| `leadCategory = 'UNCATEGORIZED'` | 45,746 | 88.9% | Enum tracking engagement state, not industry vertical |
| `customData->>'category'` present | 30,671 | 59.6% | **Real industry category source** |
| `customData->>'title'` present | 11,262 | 21.9% | Primary job title source |
| `customData->>'role'` present | 10,411 | 20.2% | Secondary job title/designation source |
| `customData->>'company'` present | 48,591 | 94.4% | Primary company name source |
| `brandId IS NULL` | 51,474 | 100.0% | **`Lead.brandId` is unpopulated** despite `Brand` having 14,960 rows! Must join/backfill via `Lead.domain = Brand.domain` |
| `domain IS NULL` | 11,720 | 22.8% | Can be derived from `split_part(lower(email), '@', 2)` |

---

## 1.7 Secrets Audit

**FAIL (Remediation Required)**:
Hardcoded credentials currently appear in **25+ git-tracked files**:
- `DATABASE_PASSWORD` (`9538564601Aa`) and full Supabase connection strings appear in `server/dbCluster.ts`, `server/auth.ts`, `scripts/*.js`, `scripts/*.ts`, `scripts/*.cjs`, and markdown docs (`QUICK_START.md`, `SECURE_LOGIN_SETUP.md`, `AUDIT_COMPLETION_SUMMARY.md`).
- `SMARTLEAD_API_KEY` (`b0042f19-...`) and `SMARTLEAD_SECONDARY_API_KEY` (`e4ebd3cd-...`) are hardcoded as fallback literals in `scripts/assign_troops_mailboxes.js`, `scripts/check_live_campaign.js`, `scripts/investigate_2k_daily_sends.ts`, `scripts/manage_team.js`, `scripts/reconcile-smartlead-fast.ts`, `scripts/register_smartlead_webhooks.js`, `scripts/smartlead_audit.js`, `scripts/smartlead_autosync.cjs`, `scripts/sync-smartlead-campaign.ts`, `scripts/sync_campaign_stats_and_events.js`, and `scripts/sync_smartlead_campaign_4103333.js`.
- `.env` itself is properly git-ignored.

---

## 1.8 Sprint 1 Verification Results (Replica 3 Isolation)

### 1.8.1 Database Synchronization & Additive Migration
- **Replica 3 Synchronization**: Reconciled all 46 base tables bit-for-bit with Primary (`0` diffs).
- **Migration Rehearsal**: Executed `20261111_brain_v1_up.sql` -> `down.sql` -> `up.sql` on Replica 3 (`adlwwkqgexykuhkdkpfu`). Verified 56 tables on Replica 3 while Primary remains untouched at 46 tables.
- **Rollback Runbook**: Documented in `docs/brain/ROLLBACK_RUNBOOK.md` with explicit 3s lock timeout and 30s statement timeout.

### 1.8.2 Deterministic Backfill Results (Step 1.2)
- **Workspace Leads Filter**: Applied single-source `workspaceBrandLeadSql` predicate isolating `50,398` B2B workspace leads (`team_tbm_main`).
- **Brand Linking**: `41,105` leads linked to `Brand.id` via domain matching (**81.6% link rate**, up from 0% pre-Sprint 1).
- **Canonical Designations Mapped**: `17,221` leads mapped to canonical designations (`FOUNDER_CEO`: 6,202, `PERFORMANCE_MARKETING_MANAGER`: 6,117, `BRAND_MANAGER`: 3,240, `CMO_MARKETING_HEAD`: 1,662).
- **Canonical Categories Mapped**: 100% of workspace leads assigned to canonical `categoryKey` (`general_b2c`: 37,949, `food_beverages`: 2,561, `healthcare_pharma`: 2,384, `ecommerce_retail`: 1,451, `fashion_apparel`: 1,425, `beauty_personal_care`: 1,288, `consumer_tech`: 1,199, `fitness_wellness`: 1,118, `luggage_travel`: 656, `jewelry_accessories`: 367).
- **Brand Tier Classification**: `14,960` brands classified into `LARGE` (178), `MID` (1), and `GROWTH` (14,781) using `data/enterprise_domains.json` and contact volumes.

### 1.8.3 Smartlead Webhook Event Structure & DQ-02 Verification (Step 1.3)
- Saved real payload captures to `docs/brain/samples/smartlead_sent_event.json` and `docs/brain/samples/smartlead_reply_event.json`.
- **Verified Smartlead Webhook Structure**:
  - `event_id`: Unique provider event ID (maps to `EmailEvent.providerEventId`).
  - `stats_id`: Outbound message ID from Smartlead.
  - `campaign_id`: Smartlead campaign ID (maps to `Campaign.providerCampaignId`).
  - `sequence_number`: Step index of the sequence (1, 2, 3).
  - `sl_email_lead_map_id` / `sl_email_lead_id`: Smartlead internal lead IDs.
  - `leadCorrespondence.replyReceivedFrom`: Real prospect replying email address.
  - `reply_message.text` / `reply_body`: Prospect's raw text reply.
- **DQ-02 Attachment Mechanism**:
  - `DraftGeneration` records `repliedEventId` and `replyClassification`.
  - When Smartlead webhook fires `eventType = 'replied'`, match `EmailEvent` via `(leadId, campaignId, sequenceNumber)` to directly attach the reply to its originating `DraftGeneration` row.

### 1.8.4 Reply Classification Audit & Cleaned Mined Dataset (Step 1.4 & 1.5)
- Hand-audited 50 recent workspace replies in `docs/brain/samples/reply_audit_50.json`.
- **Deterministic Classifier Performance on `positive` Replies**:
  - True Positives: 5
  - False Positives: 0
  - False Negatives: 0
  - True Negatives: 45
  - **Precision on `positive`**: **1.00 (100%)** (target $\ge 0.85$)
  - **Recall on `positive`**: **1.00 (100%)** (target $\ge 0.85$)
  - **Overall 8-Class Accuracy**: **1.00 (100%)**
- **Cleaned Contaminated Historical Data**:
  - Filtered 1,460 historical Apollo `EmailMessage` rows labeled `INTERESTED`.
  - Excluded 86 rows of internal/KYC/support/refund noise (`dhl.com`, `yamm.zendesk.com`, internal founders' test threads).
  - Reclassified 1 OOO and 3 Auto-responders, leaving **1,370 clean B2B Brand INTERESTED rows**.
  - Backfilled `Lead.replyClassification` across 139 live `EmailEvent` replies on Replica 3.
- **Mined Candidate ProofPoints & Playbooks (Gated for Owner Sign-off)**:
  - Mined 14 candidate `ProofPoint` rows with `approvedToMention: false, active: false` (Zero risk of entering prompt).
  - Mined 5 candidate `Playbook` rows with `status: 'DRAFT', origin: 'SYSTEM_PROPOSAL'`.
  - Full report generated at `docs/brain/MINED_CANDIDATES_FOR_REVIEW.md` awaiting human owner review.



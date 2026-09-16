# PHASE 1 PLAN — Live Email Intelligence System with Contacts Integration

**System**: Nexus Outbound & Web Intelligence Layer  
**Author**: Antigravity Intelligence Agent  
**Date**: September 16, 2026  
**Status**: **HARD STOP — PENDING HUMAN REVIEW & APPROVAL BEFORE CODE EXECUTION**  

---

## 1. Executive Summary & Resolution of Overriding Corrections

This plan outlines the architecture for transforming our email intelligence prototype into a **living, continuous intelligence system** that directly enriches and extends the existing contacts database in the codebase.

### The Three Overriding Corrections (Verified Against Reality):

1. **Body Truncation at 201 Characters**:
   - **Ground-Truth Reality**: Both `apollo_inbox_data.csv` and `apollo_inbox_data.json` cap `body_text` at 201 characters. Probing Apollo's live endpoint (`/v1/emailer_messages/{id}`) confirmed text beyond 200 chars consists solely of rep signatures, phone numbers, and whitespace.
   - **Architectural Scope**: The system is strictly scoped as a **Subject + Opening Pitch Hook + Temporal State & Re-Engagement Intelligence Layer**, **NOT** full-content RAG. No dense vector embeddings or artificial RAG will be built over truncated snippets.
2. **JSON as Primary Source**:
   - **Ground-Truth Reality**: `apollo_inbox_data.json` contains real `provider_thread_id` (97.3%), `provider_message_id` (97.3%), and `emailer_step_id` (94.3%), all of which were lost in the flat CSV.
   - **Architectural Rule**: Streaming JSON ingestion is the **exclusive primary source**. Heuristic threading is eliminated in favor of native thread and step IDs.
3. **Reply Classification Ground Truth**:
   - **Ground-Truth Reality**: Our 50-sample manual audit showed that only **46%** of replies are verified positive (`interested`), while **34%** are unverified replies (`reply_class: None` in Apollo), and **20%** are bounces, unsubscribes, not-now, or internal admin.
   - **Architectural Rule**: `replied=True` is treated as an event flag, not a positive label. Unclassified replies are tagged `unverified_reply`. Only explicit meetings/call recaps feed `DORMANT_REPLIED` and positive prompt context.

---

## 2. Existing Contacts DB — Current State

### Location & Architecture
- **Primary Schema**: [`nexus-outbound/prisma/schema.prisma`](file:///c:/Users/neola/Downloads/Email%20System%20101/nexus-outbound/prisma/schema.prisma)
- **Database Engine**: PostgreSQL (Neon / Supabase via `DATABASE_URL` and `DIRECT_URL`).
- **Core Model**: `model Lead` (currently 25 fields).

### Current Schema (`model Lead`):
```prisma
model Lead {
  id             String       @id @default(cuid())
  campaignId     String
  campaign       Campaign     @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  email          String
  firstName      String?
  lastName       String?
  source         String?      // "csv", "youtube", "instagram", "sov_panel", "hammer_head"
  customData     Json?        // Stores extra CSV columns (JSONB)
  leadCategory   LeadCategory @default(UNCATEGORIZED)
  status         LeadStatus   @default(ACTIVE)
  lastStepSent   Int          @default(0)
  aiSentiment    Sentiment?
  providerLeadId String?

  // Engagement tracking
  repliedAt      DateTime?
  unsubscribedAt DateTime?
  bounceCount    Int          @default(0)
  bounceType     String?      // "soft", "hard"
  firstOpenAt    DateTime?    // First email open timestamp
  lastOpenAt     DateTime?    // Latest email open timestamp
  openCount      Int          @default(0)
  clickCount     Int          @default(0)
  leadScore      Float        @default(0)
  timezone       String?

  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  events EmailEvent[]
  drafts AiDraft[]

  @@index([campaignId, status])
  @@index([email])
  @@index([leadCategory])
  @@index([leadScore])
}
```

### Current Consumers in the Codebase
1. **`nexus-outbound` Sending Worker & Dispatcher**: Queries `Lead` by `status: ACTIVE` and `campaignId` to execute multi-step email sequences via Smartlead/SMTP.
2. **`nexus-outbound/src/app/api/v1/contacts/search/route.ts`**: Maps Prisma `Lead` rows into the API model consumed by the frontend.
3. **`web` (Unified Contacts Frontend)**: Consumes `/api/v1/contacts/search` via React Query hooks (`useSearchContacts`, `useContact`) and models (`Contact.ts`, `SearchContactsFilter.ts`).
4. **`nexus-outbound/src/app/api/v1/contacts/segments/route.ts`**: Currently returns static mock segments (`seg_all`, `seg_replied`, `seg_high_score`) awaiting a real database-backed segmentation engine.
5. **Suppression System**: `SuppressedEmail` model (3,732 active quarantined addresses) checked before sending.

### Current Limitations Identified
- `campaignId` is currently non-nullable in Prisma (`campaignId String`), meaning every contact currently must belong to a specific campaign. For a global living contacts directory, contacts must be able to exist as master contacts independently of an active campaign (`campaignId String?`).
- There is currently **no Brand/Company model** in Prisma (company names are loosely stored in `customData` JSONB).
- There is currently **no `Segment` model** in Prisma to persist saved filters.
- There is currently **no append-only message log** in PostgreSQL.

---

## 3. Proposed Schema Extensions & New Models

We will extend `nexus-outbound/prisma/schema.prisma` directly. No parallel database or disconnected tables.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          PRISMA POSTGRESQL SCHEMA                      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  [ Layer A: Message Log ]                                              │
│  model EmailMessage {                                                  │
│    id, threadId, contactEmail, senderEmail, subject, bodyHook,         │
│    status, bounced, spamBlocked, replied, replyClass, ...              │
│  }                                                                     │
│                                                                        │
│  [ Layer B: Extended Contacts ]                                        │
│  model Lead / Contact {                                                │
│    (existing fields: id, email, firstName, lastName, ...)              │
│    + lastMessageId, lastSubject, lastBodyHook, lastSender              │
│    + totalMessages, totalReplied, totalBounced                         │
│    + firstContactedAt, lastContactedAt, daysSinceLastContact           │
│    + recencyBucket (Enum), outreachState (Enum)                        │
│    + isBurned, isDormant, isReengagementCandidate                      │
│    + replyClassification (Enum), tags (String[])                       │
│    + brandId ──> references Brand.id                                   │
│  }                                                                     │
│                                                                        │
│  [ Layer C: Brand Intelligence ]                                       │
│  model Brand {                                                         │
│    id, domain, name, totalContacts, cleanContacts, burnedContacts,     │
│    repliedContacts, lastContactedAt, outreachState, tags               │
│  }                                                                     │
│                                                                        │
│  [ Layer D: Quarantine ]                                               │
│  model SuppressedEmail (Existing — 3,732 active records)               │
│                                                                        │
│  [ Segmentation Engine ]                                               │
│  model ContactSegment {                                                │
│    id, name, description, filterJson, createdBy, lastRunAt, lastCount  │
│  }                                                                     │
└────────────────────────────────────────────────────────────────────────┘
```

### Layer A: Append-Only Event Log (`model EmailMessage`)
```prisma
model EmailMessage {
  id                   String       @id // Apollo message ID or provider ID
  providerThreadId     String?
  providerMessageId    String?
  contactEmail         String
  brandDomain          String?
  senderEmail          String
  senderName           String?
  direction            String       @default("outbound") // outbound | inbound
  subjectRaw           String
  subjectNormalized    String
  bodyHook             String       // first 201 chars
  bodyFull             String?      // null when truncated in source
  campaignRaw          String?
  campaignClean        String?
  stepId               String?
  touchId              String?
  status               String       // completed | failed
  bounced              Boolean      @default(false)
  spamBlocked          Boolean      @default(false)
  replied              Boolean      @default(false)
  replyClassification  ReplyClass   @default(NONE)
  failureReason        String?
  createdAt            DateTime
  ingestedAt           DateTime     @default(now())
  source               String       @default("json") // json | csv | api | webhook
  isExcluded           Boolean      @default(false)  // true for internal/support threads

  @@index([contactEmail])
  @@index([brandDomain])
  @@index([providerThreadId])
  @@index([createdAt])
  @@index([replyClassification])
}
```

### Layer B: Enriched Contacts Model (`model Lead`)
Add the following fields to `model Lead` in `prisma/schema.prisma`:
```prisma
  // ─── EMAIL INTELLIGENCE EXTENSIONS (Phase 1) ─────────────────
  brandId                  String?
  brand                    Brand?               @relation(fields: [brandId], references: [id])
  domain                   String?

  // Last Message Context
  lastMessageId            String?
  lastMessageAt            DateTime?
  lastSubject              String?
  lastBodyHook             String?
  lastSender               String?
  lastCampaign             String?
  lastOutcome              String?              // delivered | bounced | spam_blocked | replied | failed

  // Lifetime Volume Counters
  totalMessages            Int                  @default(0)
  totalOutbound            Int                  @default(0)
  totalInbound             Int                  @default(0)
  totalReplied             Int                  @default(0)
  totalBounced             Int                  @default(0)
  totalSpam                Int                  @default(0)

  // Temporal Timestamps & Deltas
  firstContactedAt         DateTime?
  lastContactedAt          DateTime?
  lastDeliveredAt          DateTime?
  lastRepliedAt            DateTime?
  lastBouncedAt            DateTime?
  daysSinceFirstContact    Int?
  daysSinceLastContact     Int?
  daysSinceLastReply       Int?
  contactFrequencyDays     Float?

  // First-Class State & Segmentation
  recencyBucket            RecencyBucket        @default(NEVER_CONTACTED)
  outreachState            OutreachState        @default(UNKNOWN)
  isBurned                 Boolean              @default(false)
  isDormant                Boolean              @default(false)
  isReengagementCandidate  Boolean              @default(false)
  replyClassification      ReplyClass           @default(NONE)

  // Tags & Metadata
  tags                     String[]             @default([])
  intelligenceUpdatedAt    DateTime?

  @@index([domain])
  @@index([recencyBucket])
  @@index([outreachState])
  @@index([isReengagementCandidate])
  @@index([daysSinceLastContact])
```

### Layer C: Brand Model (`model Brand`)
```prisma
model Brand {
  id                    String        @id @default(cuid())
  domain                String        @unique // e.g. "unilever.com", "atomberg.com"
  name                  String?       // "Unilever", "Atomberg"
  totalContacts         Int           @default(0)
  cleanContacts         Int           @default(0)
  burnedContacts        Int           @default(0)
  repliedContacts       Int           @default(0)
  lastContactedAt       DateTime?
  daysSinceLastContact  Int?
  recencyBucket         RecencyBucket @default(NEVER_CONTACTED)
  outreachState         OutreachState @default(UNKNOWN)
  tags                  String[]      @default([])
  createdAt             DateTime      @default(now())
  updatedAt             DateTime      @updatedAt

  leads                 Lead[]

  @@index([domain])
  @@index([outreachState])
  @@index([recencyBucket])
}
```

### Layer D: Segmentation Persistence (`model ContactSegment`)
```prisma
model ContactSegment {
  id          String   @id @default(cuid())
  name        String
  description String?
  filterJson  Json     // Structured filter AST
  createdBy   String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  lastRunAt   DateTime?
  lastCount   Int      @default(0)

  @@index([name])
}
```

### New Prisma Enums:
```prisma
enum RecencyBucket {
  NEVER_CONTACTED
  TOUCHED_THIS_WEEK       // 0–7 days
  TOUCHED_THIS_MONTH      // 8–30 days
  TOUCHED_THIS_QUARTER    // 31–90 days
  TOUCHED_LAST_6_MONTHS   // 91–180 days
  TOUCHED_LAST_YEAR       // 181–365 days
  DORMANT_1_TO_2_YEARS    // 366–730 days
  DORMANT_OVER_2_YEARS    // > 730 days
}

enum OutreachState {
  BURNED                  // Bounced >= 1 or spam_blocked >= 1 or unsubscribed
  DO_NOT_CONTACT_RECENTLY // Contacted <= 7 days ago
  WARM_ACTIVE             // Replied in last 30 days
  WARM_STALE              // Replied 31–180 days ago
  IN_SEQUENCE             // Clean, contacted <= 180 days ago, no reply
  COLD_REENGAGEMENT       // Clean, contacted > 180 days ago, no reply
  DORMANT_REPLIED         // Clean, contacted > 180 days ago, replied interested
  NEVER_REACHED           // All touches failed/bounced
  UNKNOWN
}

enum ReplyClass {
  NONE
  INTERESTED
  NOT_NOW
  WRONG_PERSON
  UNSUBSCRIBE
  AUTO_RESPONDER
  OOO
  UNVERIFIED_REPLY
}
```

---

## 4. Ingestion & Event Processing Flow (Live System)

When an email arrives (batch migration or webhook/API event):

```
New Email Event
      │
      ▼
1. Idempotency Check: `SELECT id FROM EmailMessage WHERE id = :id`
   └─ If exists ➔ skip insertion.
      │
      ▼
2. Exclusion Check:
   └─ If domain in ('theboredmonkey.com', 'theboredmonkey.in') or support desk or vendor invoice:
      ➔ Tag `isExcluded = true`. Do not link to active prospect contacts.
      │
      ▼
3. Insert into `EmailMessage` (Layer A append-only log).
      │
      ▼
4. Recompute Contact State (`model Lead`):
   ├─ If bounced/spam/unsubscribed:
   │    ➔ Add to `SuppressedEmail`
   │    ➔ Set `isBurned = true`, `outreachState = BURNED`, `recencyBucket = ...`
   ├─ Fetch all messages for contact ordered by `createdAt ASC`
   ├─ Recompute: `totalMessages`, `totalReplied`, `lastContactedAt`, `daysSinceLastContact`
   ├─ Evaluate `bestReplyClass`:
   │    If `INTERESTED` and `days > 180` ➔ `outreachState = DORMANT_REPLIED`, `isReengagementCandidate = true`
   │    If no reply and `days > 180`     ➔ `outreachState = COLD_REENGAGEMENT`
   │    If `days <= 7`                   ➔ `outreachState = DO_NOT_CONTACT_RECENTLY`
   ├─ Update `lastSubject`, `lastBodyHook`, `lastSender`, `lastMessageAt`
   └─ Save `Lead` record.
      │
      ▼
5. Recompute Brand State (`model Brand`):
   ├─ Upsert `Brand` record by domain
   ├─ Count totalContacts, cleanContacts, burnedContacts, repliedContacts
   └─ Update brand-level `outreachState` and `lastContactedAt`.
      │
      ▼
6. Observability: Log event, state transition, and execution time.
```

---

## 5. Daily Refresh Job Design

### Why It's Mandatory
`daysSinceLastContact` increases by +1 every 24 hours. Without a recurring job, a contact contacted 7 days ago remains `DO_NOT_CONTACT_RECENTLY` forever.

### Execution Specs
- **Schedule**: Runs daily at `00:05 UTC` (via Inngest job or node-cron script: `scripts/daily_refresh.ts`).
- **Logic**:
  1. Computes `daysSinceLastContact = floor(extract(epoch from (now() - lastContactedAt)) / 86400)`.
  2. Updates `recencyBucket` across all contacts using SQL `CASE` statement (runs in < 1 second on PostgreSQL for 28k rows).
  3. Transitions outreach states:
     - `DO_NOT_CONTACT_RECENTLY` (now > 7 days) ➔ transitions to `IN_SEQUENCE` or `WARM_ACTIVE`.
     - `IN_SEQUENCE` (now > 180 days) ➔ transitions to `COLD_REENGAGEMENT`.
     - `WARM_ACTIVE` (now > 30 days) ➔ transitions to `WARM_STALE`.
  4. Recalculates `lastCount` for all active saved segments (`model ContactSegment`).
  5. Emits an audit log entry: `AuditLog` table records execution duration and drifted counts.

---

## 6. Segmentation and Filter Engine

The segmentation layer extends [`nexus-outbound/src/app/api/v1/contacts/search/route.ts`](file:///c:/Users/neola/Downloads/Email%20System%20101/nexus-outbound/src/app/api/v1/contacts/search/route.ts) and [`segments/route.ts`](file:///c:/Users/neola/Downloads/Email%20System%20101/nexus-outbound/src/app/api/v1/contacts/segments/route.ts) with full PostgreSQL parameterization.

### Supported Filter Dimensions (AND Logic, Multi-Select Values):

| Category | Filter Key | Type | Description |
| :--- | :--- | :--- | :--- |
| **Temporal** | `recency_buckets` | `RecencyBucket[]` | Multi-select: e.g. `['DORMANT_1_TO_2_YEARS', 'DORMANT_OVER_2_YEARS']` |
| | `outreach_states` | `OutreachState[]` | Multi-select: e.g. `['DORMANT_REPLIED', 'COLD_REENGAGEMENT']` |
| | `days_since_contact_min` | `Int` | e.g. `180` |
| | `days_since_contact_max` | `Int` | e.g. `540` |
| | `contacted_date_range` | `{ start: ISO, end: ISO }` | Calendar date boundary |
| **Engagement** | `replied` | `Boolean` | Has ever replied |
| | `reply_classifications` | `ReplyClass[]` | Multi-select: e.g. `['INTERESTED']` |
| | `min_touches` / `max_touches` | `Int` | Sequence touch count |
| **Deliverability** | `is_burned` | `Boolean` | Filter out burned (quarantine) contacts |
| | `verification_status` | `String[]` | `['valid', 'risky']` |
| **Company & Brand** | `domains` | `String[]` | e.g. `['unilever.com', 'atomberg.com']` |
| | `company_query` | `String` | Text search over brand name / domain |
| **Campaign & Content** | `campaigns` | `String[]` | Clean campaign name filter |
| | `subject_contains` | `String` | Keyword search in `lastSubject` |
| | `hook_contains` | `String` | Keyword search in `lastBodyHook` |
| | `tags` | `String[]` | Tag vocabulary matching |

### Segment Outputs
1. **Count Preview**: `POST /api/v1/contacts/segments/count` returns total matching leads instantly (`SELECT COUNT(*)...`).
2. **Paginated Results**: `POST /api/v1/contacts/search` returns contacts formatted for the `web` Contacts UI.
3. **Export**: `POST /api/v1/contacts/export` returns streaming CSV or JSON for offline tools.
4. **Campaign Feeding**: `POST /api/v1/campaigns/:id/leads/import-segment` feeds the segment directly into a new outbound sequence in Nexus Outbound.

---

## 7. Retrieval & LLM Context Builder

Implemented directly in TypeScript in [`nexus-outbound/src/lib/ai/context-builder.ts`](file:///c:/Users/neola/Downloads/Email%20System%20101/nexus-outbound/src/lib/ai/):

### Output Schema:
```typescript
interface ContactPromptContext {
  email: string;
  name: string;
  company: string;
  domain: string;
  isBurned: boolean;
  temporalState: OutreachState;
  recencyDescription: string; // e.g. "Last contacted 7 months ago (Feb 4, 2026)"
  touchCount: number;
  lastRep: {
    name: string;
    email: string;
    campaign: string;
  };
  lastMessage: {
    subject: string;
    openingHook: string;
    outcome: string;
  };
  promptGuidelines: string[];
  touchTimeline: Array<{
    step: number;
    date: string;
    rep: string;
    subject: string;
    hook: string;
  }>;
}
```

This context object is injected directly into [`nexus-outbound/src/app/api/ai/draft-reply/route.ts`](file:///c:/Users/neola/Downloads/Email%20System%20101/nexus-outbound/src/app/api/ai/draft-reply/route.ts) and campaign sequence generators to ensure hyper-personalized re-engagement.

---

## 8. What We Will Skip and Why

1. **Vector Embeddings / Multi-Index RAG**: Skipped. Bodies are 200-char preview hooks. Parametric SQL filters over `recencyBucket`, `outreachState`, and `domain` solve 100% of the required queries in < 5ms.
2. **Fine-Tuning a Model**: Skipped. Zero inbound prospect reply texts exist in the dataset; fine-tuning would produce a broken model.
3. **LLM Summaries for 86K Rows**: Skipped. The 200-char opening hook is already concise and readable.
4. **Heuristic Threading**: Skipped. Real `provider_thread_id` and `emailer_step_id` exist in the JSON.
5. **Parallel Contacts Database**: Skipped. All extensions will be migrated directly into the existing PostgreSQL `Lead` and `Brand` models.

---

## 9. Verification & Adversarial Test Plan

1. **Schema & Migration Verification**:
   - Run `npx prisma db push` or `prisma migrate`.
   - Verify Prisma client generates cleanly without TypeScript errors.
2. **Exhaustive Quarantine Zero-Leakage Test**:
   - Assert with an unconstrained SQL set intersection (`INTERSECT`) that zero burned contacts ever appear in any re-engagement or active segment query.
3. **Internal Domain Rejection Test**:
   - Assert `theboredmonkey.com`, `theboredmonkey.in`, and teammate cc's never appear as prospect leads.
4. **Idempotency Test**:
   - Ingesting a sample batch of 1,000 JSON messages twice produces identical message counts and identical contact state.
5. **Daily Drift Simulation Test**:
   - Advance system time programmatically by +30 days, run daily refresh job, and assert that `TOUCHED_THIS_WEEK` contacts drift correctly to `TOUCHED_THIS_MONTH`.
6. **Segmentation Engine Assertions**:
   - Execute combined multi-select queries ("Food & Beverage + Dormant > 180d + Interested") and assert precision.

---

## 10. The Consumers (Named Explicitly)

- **`nexus-outbound`**: Reads quarantine (`SuppressedEmail`) and enriched contacts (`Lead`) to power live sending sequences and enforce domain safety.
- **`web`**: Renders the Contacts Directory UI, Segment Builder, and Account Overview screens.
- **`nexus-outbound/src/lib/ai`**: Consumes `buildContactPromptContext()` to inject past outreach history into GPT/Claude prompt templates.

---

## 11. Hard Stop Confirmation

> [!IMPORTANT]
> **This concludes the Phase 1 Implementation Plan for the Live System.**  
> As required by the project brief: **All implementation is stopped.**  
> 
> **Next Step**: Please review this plan and confirm approval before we proceed to writing Prisma migrations and code.

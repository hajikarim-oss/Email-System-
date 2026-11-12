# Architectural & Operational Decisions Log (`DECISIONS.md`)

**Version**: 2.2 (Pre-Sprint 1 Baseline)  
**Date**: 2026-11-11  
**Status**: Locked prior to Sprint 1 kickoff

---

## D-01: Strict Sprint 1 Sequencing — Reply Classifier Audit (Fix #2) Before Brain Mining (Fix #1)
- **Context**: `EmailMessage` (`86,301` rows) has historical `replyClassification = 'INTERESTED'` rows contaminated with internal KYC/support threads, and live `EmailEvent` replies currently leave `Lead.replyClassification = 'NONE'` while marking OOO/auto-replies as `REPLIED`.
- **Decision**: `scripts/bootstrap_brain.ts` (Fix #1) **must not run** until Fix #2 is complete:
  1. Build the deterministic OOO / auto-reply / unsubscribe / internal-thread filter + reply classifier.
  2. Hand-label 50 recent workspace replies (`docs/brain/samples/reply_audit_50.json`) and verify **Precision $\ge 0.85$ and Recall $\ge 0.85$** on positive (`INTERESTED`) replies.
  3. Apply the verified filter/classifier to clean the historical `INTERESTED` set.
  4. **Only then** mine candidate `ProofPoint`s (`approvedToMention: false`, `active: false`) and candidate `Playbook`s (`origin: 'SYSTEM_PROPOSAL'`, `status: 'DRAFT'`) into `docs/brain/MINED_CANDIDATES_FOR_REVIEW.md`.

---

## D-02: Blind A/B Candidate Models & Frozen Rubric Judge (Phase 0.8 / Sprint 3)
- **Context**: Sprint 3 runs a blind A/B model selection on 20 real workspace leads spanning `categoryKey × designation`.
- **Decision**:
  - **Candidate Models**:
    1. `gpt-4o-mini` (baseline across roles)
    2. `gpt-4o` (writer premium)
    3. `gemini-2.5-flash` (cost floor)
    4. `claude-haiku` (prose quality)
  - **Rubric Judge Model (`scripts/evalHarness.ts`)**: Must be strictly disjoint from the winning writer model (use `claude-3-5-sonnet` or `gemini-2.5-pro`; or `gpt-4o` only if `gpt-4o` is not selected as the writer). Once recorded here after Sprint 3, changing the judge model requires re-baselining the entire `EvalCase` set.

---

## D-03: Deterministic `Brand.tier` Rule & `data/enterprise_domains.json`
- **Context**: `route.ts` applies a `-25` risk-score penalty when `Brand.tier === 'LARGE'` and logs `tier_unknown` if `tier` is undefined (`AT-18`).
- **Decision**: Every row in `Brand` (`14,960` domains) is assigned a deterministic `tier` during the Sprint 1 backfill using:
  - `'LARGE'`: `Brand.totalContacts >= 500` **OR** `LOWER(Brand.domain) IN (data/enterprise_domains.json)`
  - `'MID'`: `Brand.totalContacts >= 100` (and not `'LARGE'`)
  - `'GROWTH'`: `Brand.totalContacts < 100` (and not in `data/enterprise_domains.json`)
- `data/enterprise_domains.json` is seeded in Sprint 1 from the top 100 workspace brand domains by `totalContacts` plus curated enterprise conglomerates and reviewed once by the owner before Sprint 2.

---

## D-04: Sprint 4 Review UI Scope Boundary
- **Context**: `web/` is a rich React 19 + Vite application; an unbounded Review UI could expand into weeks of frontend polish.
- **Decision**: Sprint 4 Review UI is strictly a single admin-only page at `/admin/brain/review` (target: 2–3 days of frontend work):
  - **List View**: Paginated `PENDING_REVIEW` drafts with segment, angle, risk band, routing, and violation counts.
  - **Detail Panel**: Full Email 1 + Follow-up 1 + Follow-up 2, scraped `BrandResearch` signals, chosen `ProofPoint`s, HARD/SOFT violations, and `riskReasons`.
  - **Three Inline Actions**: `Approve`, `Edit & Approve` (computes Levenshtein `editDistance`), and `Reject`.
  - No animations, no design-system overhaul, no mobile layout in Sprint 4.

---

## D-05: Sprint 1 `DQ-02` Reply-Webhook Contract Verification
- **Context**: `DraftGeneration` stores `repliedEventId` and `replyClassification` to attribute replies directly to the originating draft.
- **Decision**: During the Sprint 1 Phase 0.2 seed test, we will reply from the seed inbox to the Step 1 email and capture `docs/brain/samples/smartlead_reply_event.json`.
  - We will verify whether the payload includes `campaign_id`, lead email (`from_email` / `to_email` / `lead_email`), and either `sequence_number`/`step`/`stats_id` OR `reply_to_message_id`/`message_id`.
  - If Smartlead omits the step identifier on reply webhooks, the documented deterministic fallback is: attach the reply to the most recent `SENT` `DraftGeneration` row for `(campaignId, leadEmail)` where `createdAt <= reply.timestamp`.

---

## D-06: Statistical Sample Size Expectations for `weeklyLearningJob`
- **Context**: Two-proportion Z-test ($80\%$ power, $\alpha = 0.05$) requires $\ge 430$ sends per variant ($\ge 860$ sends per 2-angle segment) to detect a $5\% \to 10\%$ lift.
- **Decision**: Sprint 5 (100–150 leads) establishes **pipeline safety, edit-rate compliance ($<30\%$), and the frozen `EvalCase` regression baseline**—it will **not** produce an eligible `ChangeProposal`. At 100–200 leads/day, the first statistically valid `ChangeProposal` will be generated **4–6 weeks after Sprint 5 completes**. Until a segment reaches $430$ sends per variant, `weeklyReport.ts` logs segment metrics with `INSUFFICIENT_SAMPLE`.

---

## D-07: Pre-Committed Decision Tree If Sprint 5 Edit Rate $> 30\%$
- **Context**: Sprint 5's exit gate is human edit rate $< 30\%$ across 100–150 real workspace leads.
- **Decision**:
  - **If Edit Rate $< 30\%$**: Gate passes. Freeze $\ge 100$ `EvalCase`s and record `evalHarness` baseline.
  - **If Edit Rate is $30\%–40\%$**: Sample 20 edited drafts and categorize each human edit into one of four buckets:
    1. *(a) Factual / Claim Error* → Validator missed a rule; tighten `validate.ts`.
    2. *(b) Style / Wording / Tone* → Writer prompt too rigid; adjust `prompts/writer.v1.ts`.
    3. *(c) Wrong Angle or Proof Point* → Retrieval/Playbook mismatch; refine `Playbook` or `prompts/planner.v1.ts`.
    4. *(d) Missing or Weak Research Signal* → Research thin; adjust `research.ts`.
    Fix **only the single largest bucket**, run 20 new leads, and re-measure.
  - **If Edit Rate $> 40\%$**: Hard stop. Do not proceed to Primary volume; diagnose structural failure against the frozen `EvalCase` set.

---

## D-08: 10-Lead Internal-Inbox Rehearsal on Primary Before Sprint 5
- **Context**: Jumping directly from 3 test leads on Replica 3 (Sprint 4) to 100–150 real prospect leads on Primary (Sprint 5) risks uncovering Primary-specific configuration issues on live prospects.
- **Decision**: Between Sprint 4 exit and Sprint 5 start, after applying the additive migration to Primary, run **10 internal test leads** (using internal `@theboredmonkey.com` seed addresses, zero external prospects) through the full pipeline on Primary. Verify draft generation, `PENDING_REVIEW` queue, `editDistance` calculation, 1 live Smartlead send, `EMAIL_SENT` webhook correlation, and internal inbox `EMAIL_REPLY` linkage before ingesting the 100–150 real workspace leads.

---

## D-09: Production Model Selection — gpt-4o-mini Selected Over gpt-4o (Sprint 3 / Phase 0.8)
- **Context**: Blind A/B model evaluation was executed across 10-20 workspace leads spanning top categories (`food_beverages`, `fashion_apparel`, `healthcare_pharma`, `beauty_personal_care`, `luggage_travel`, `consumer_tech`).
- **Results**:
  - `gpt-4o-mini`: 80.0% clean pass, **0 hard errors**, 2 soft warnings, \$0.00024 / lead, 3.5s latency.
  - `gpt-4o`: 50.0% clean pass, **3 hard errors** (subject word limit violations and conversational drift), 4 soft warnings, \$0.00396 / lead (16.6x cost), 2.7s latency.
  - Head-to-head rounds: 6 Ties, 3 Wins for `gpt-4o-mini`, 0 Wins for `gpt-4o`.
- **Decision**: Select **`gpt-4o-mini`** as the dedicated production writer model for the Brain pipeline. It demonstrates superior adherence to deterministic formatting constraints (<= 7 word subjects, zero meeting asks, variable syntax preservation) at 1/16th the token cost. gpt-4o is rejected due to prompt boundary regression and prohibitive unit economics (\$39.61 vs \$2.38 per 10k sends).

---

## D-10: Strategic Sequencing — Path A Formally Adopted (PIE §0.5)
- **Context**: PIE is an additive architectural layer designed to reason about brand business situations, while Track 0 directly fixes the historical click-to-reply bottleneck.
- **Decision**: **Path A is adopted**:
  1. Ship Track 0 (T0-1 through T0-6) and the current Outreach Brain to Primary after owner review of the 84 pending drafts.
  2. Build and validate PIE on Replica 3 in parallel without blocking production traffic or the proven CTA lever.
  3. PIE is evaluated in stages: Phase 3 (thesis sharpness $\ge 4.0$ vs owner gold standard), Phase 4 (edit rate $< 30\%$), and Phase 5 (real prospect reply rate beating the 0.14% baseline).

---

## D-11: PIE Value Beyond Cold Email & Knowledge Base Curation Commitment (PIE §0.5)
- **Context**: PIE’s return on investment depends on the thesis being reused across the entire client lifecycle, not just generating cold outreach emails.
- **Decision**:
  - **Two non-email uses of the PartnershipThesis**:
    1. *Account Management Call Prep*: AM reads the top grounded gap and proof point before every HIGH-tier prospect discovery call.
    2. *Pitch Deck Customization*: The diagnosis and category benchmark delta become Slide 1 of every pilot-category pitch deck.
  - **Accountable Curator**: Owner / Lead Partnerships Architect commits ~4 hours during Phase 0 seeding and ~1 hour/month ongoing to maintain Capability Graph and Category Benchmark accuracy.
  - **Ad-Library Fallback**: If ad-library live data is unavailable, Phase 1 completeness gate degrades from $\ge 70\%$ to $\ge 50\%$ (dossier proceeds with website, careers, and catalog data) rather than stalling the pipeline.

---

## D-12: Hard Gate Precondition — Layer 6 (L6 Pitch Gen) Blocked Pending Phase 3 Thesis Gate
- **Context**: The PIE engine must prove it produces a sharp, grounded business diagnosis before building email rendering machinery.
- **Decision**: **Do NOT build Layer 6 (pitch/email generation) yet.** Layer 6 is strictly downstream of Phase 3. The engine must first generate a real F&B diagnosis and achieve owner sign-off on thesis sharpness ($\ge 4.0/5$) on Replica 3 before any thesis is wired into email rendering.




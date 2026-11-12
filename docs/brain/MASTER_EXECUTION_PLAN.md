# Master End-to-End Execution Plan v2.2 (Final): TBM AI Outreach Brain

**Scope**: Strictly TBM Main Brand Workspace (`50,494` B2B Brand Leads, `14,960` Brands, `86,301` historical `EmailMessage` rows). Zero Troops/Creator leads or tables, enforced via a single-source `isWorkspaceBrandLead` predicate in `server/automation/brain/config.ts`.  
**Staging Environment**: Replica 3 (`adlwwkqgexykuhkdkpfu` — Singapore), verified at 100% parity with Primary (`hsmudwkfwmvinhtggxyd` — Tokyo).  
**Timeline**: **3–4 Weeks Build (Sprints 1–4)** + **2–3 Weeks Supervised Proof (Sprint 5)** = **6–7 Weeks Total**.  
**Pre-Committed Decisions**: Recorded in [`docs/brain/DECISIONS.md`](./DECISIONS.md).

---

## 1. Six Sprint 1–4 Clarifications + Two Sprint 5 Clarifications (Locked)

1. **Strict Sprint 1 Sequencing (Fix #2 Before Fix #1)**:
   - Complete the 50-reply hand-label audit and OOO/auto-reply/internal-KYC classifier fix ($P \ge 0.85, R \ge 0.85$) **before** running `bootstrap_brain.ts` so mined `ProofPoint`s (`approvedToMention: false`) and `Playbook`s (`origin: 'SYSTEM_PROPOSAL', status: 'DRAFT'`) are extracted strictly from the *cleaned* `INTERESTED` set.
2. **Named Blind A/B Candidate Models & Disjoint Judge (Sprint 3)**:
   - Candidates: `gpt-4o-mini`, `gpt-4o`, `gemini-2.5-flash`, `claude-haiku`.
   - Rubric Judge: Strictly disjoint from the winning writer model, frozen in `docs/brain/DECISIONS.md`.
3. **Deterministic `Brand.tier` Rule (`data/enterprise_domains.json`)**:
   - `'LARGE'` if `totalContacts >= 500` OR `LOWER(domain) IN (data/enterprise_domains.json)`; `'MID'` if `totalContacts >= 100`; `'GROWTH'` otherwise. Seeded from top 100 domains by `totalContacts` + known enterprises and reviewed once by owner before Sprint 2.
4. **Scoped Sprint 4 Review UI (2–3 Days Target)**:
   - Single admin page at `/admin/brain/review` with list view, detail panel, and 3 inline actions (`Approve`, `Edit & Approve`, `Reject`). No design-system bloat.
5. **Explicit `DQ-02` Reply-Webhook Payload Verification (Sprint 1)**:
   - Reply from the seed inbox to Step 1 during Sprint 1, capture `docs/brain/samples/smartlead_reply_event.json`, and verify presence of `campaign_id`, email, and `sequence_number`/`step` or `message_id` (or document the timestamp-ordered `SENT` step fallback) before Sprint 4.
6. **Learning Loop Sample Size Timeline**:
   - Sprint 5 proves pipeline safety and locks the `evalHarness` baseline; because `weeklyLearningJob` requires $\ge 430$ sends per variant, the first promotable `ChangeProposal` arrives **4–6 weeks after Sprint 5**. Until then, `weeklyReport.ts` logs `INSUFFICIENT_SAMPLE`.
7. **Pre-Committed `Edit Rate > 30%` Decision Tree (Sprint 5)**:
   - If edit rate is $30\%–40\%$, categorize 20 edited drafts into `(a) Factual`, `(b) Style/Wording`, `(c) Wrong Angle/Proof`, or `(d) Thin Research`, fix the majority bucket, and re-run 20 leads. If $>40\%$, hard stop before Primary volume.
8. **10-Lead Internal-Inbox Rehearsal on Primary (Between Sprint 4 and Sprint 5)**:
   - Run 10 internal `@theboredmonkey.com` test leads through the full pipeline on Primary (verify `PENDING_REVIEW`, `editDistance`, 1 live send, `EMAIL_SENT` webhook, and internal reply linkage) before running the 100–150 real workspace leads.

---

## 2. Hard Gate at the End of Sprint 1

Approve this plan and I will execute Sprint 1 on Replica 3. Sprint 1 ends with a report and a review queue for you: $\ge 10$ ProofPoints, $\ge 3$ Playbooks, the hand-labeled reply audit, the seed test webhook captures, and the `ROLLBACK_RUNBOOK.md`. I will not begin Sprint 2 until you've signed off on the Sprint 1 deliverables.

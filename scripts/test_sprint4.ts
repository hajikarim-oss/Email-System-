/**
 * Test script for Sprint 4 (Integration, Webhook DQ-02, Brain API & Weekly Learning Loop)
 */
import { recordSmartleadEvent } from '../server/smartleadWebhook';
import { runWeeklyLearningJob } from './weekly_learning_loop';
import { db } from '../server/db';

async function main() {
  console.log('Testing Sprint 4 on Replica 3...');

  // 1. Verify DraftGeneration exists for testing DQ-02
  const draftRow = await db.query(
    `SELECT id, "leadId", "leadEmail", "sequenceStep" FROM "DraftGeneration" LIMIT 1`
  );
  if (draftRow.rows.length === 0) {
    throw new Error('No DraftGeneration found on Replica 3. Run Sprint 3 first.');
  }
  const draft = draftRow.rows[0];
  console.log(`[Test 1] Found draft ${draft.id} for lead ${draft.leadEmail} (step ${draft.sequenceStep})`);

  // 2. Simulate an incoming Smartlead reply webhook
  console.log('\n--- Testing DQ-02 Webhook Reply Attachment ---');
  const simulatedReplyPayload = {
    event_type: 'EMAIL_REPLIED',
    event_id: `test_sl_reply_${Date.now()}`,
    campaign_id: '4470575',
    sequence_number: draft.sequenceStep,
    to_email: draft.leadEmail,
    sl_lead_email: draft.leadEmail,
    reply_body: 'Hi Snehal, Give me more details and share your creds deck. Let’s connect tomorrow at 2 PM. Thanks!',
    subject: 'Re: 3 AI films, zero shoot days',
    timestamp: new Date().toISOString(),
  };

  const outcome = await recordSmartleadEvent(simulatedReplyPayload);
  console.log(`Webhook ingestion outcome: ${outcome}`);

  // Verify Lead.replyClassification and DraftGeneration.repliedEventId
  const leadCheck = await db.query(
    `SELECT id, status, "replyClassification" FROM "Lead" WHERE id = $1`,
    [draft.leadId]
  );
  console.log('Lead after reply webhook:', leadCheck.rows[0]);

  const draftCheck = await db.query(
    `SELECT id, "repliedEventId", "replyClassification" FROM "DraftGeneration" WHERE id = $1`,
    [draft.id]
  );
  console.log('DraftGeneration after reply webhook (DQ-02 verification):', draftCheck.rows[0]);

  if (!draftCheck.rows[0].repliedEventId) {
    throw new Error('DQ-02 reply attachment failed: repliedEventId is null on DraftGeneration!');
  }
  if (draftCheck.rows[0].replyClassification !== 'INTERESTED') {
    throw new Error(`Expected replyClassification = 'INTERESTED', got: ${draftCheck.rows[0].replyClassification}`);
  }
  console.log('DQ-02 verified! Reply attached directly to originating DraftGeneration row.');

  // 3. Test Weekly Learning Loop on Replica 3
  console.log('\n--- Testing Weekly Learning Loop ---');
  const learningReport = await runWeeklyLearningJob();
  console.log(`Slices analyzed: ${learningReport.slices.length}, Proposals created: ${learningReport.proposalsCreated}`);

  const proposals = await db.query(
    `SELECT "id", "kind", "rationale", "status" FROM "ChangeProposal" ORDER BY "createdAt" DESC LIMIT 3`
  );
  console.log('Latest ChangeProposals on Replica 3:', proposals.rows);

  console.log('\nSprint 4 tests PASSED successfully on Replica 3!');
}

main().catch((err) => {
  console.error('Sprint 4 test failed:', err);
  process.exit(1);
});

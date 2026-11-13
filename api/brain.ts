import type { IncomingMessage, ServerResponse } from 'node:http';
import { db } from '../server/db';
import { generateThesisForBrand } from '../server/automation/brain/pie/gapEngine';
import {
  generateGroundedPitchForContact,
  generatePitchesForBatch,
  persistApprovedPitch,
  type ApprovePitchInput,
} from '../server/automation/brain/pie/pitchGenerator';
import {
  classifyReply,
  classifyReplies,
  type ClassifyReplyInput,
} from '../server/automation/brain/pie/replyClassifierLLM';
import {
  computeChangeProposals,
  listChangeProposals,
  setChangeProposalStatus,
} from '../server/automation/brain/pie/learningLoop';
import { runInboundReplyLoop } from '../server/automation/brain/pie/inboundLoop';
import { listPieNotifications, ackPieNotification } from '../server/automation/brain/pie/pieNotifications';

function sendJson(res: ServerResponse, status: number, data: any) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

export async function brainHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname;
  const method = req.method || 'GET';

  try {
    // 1. GET /api/brain/drafts
    if (pathname === '/api/brain/drafts' && method === 'GET') {
      const statusFilter = url.searchParams.get('status') || 'ALL';
      const limit = Number.parseInt(url.searchParams.get('limit') || '50', 10);

      const whereClause =
        statusFilter === 'ALL'
          ? ''
          : `WHERE dg.status = '${statusFilter.replace(/'/g, '')}'`;

      const rows = await db.query(`
        SELECT
          dg.id,
          dg."leadId",
          dg."leadEmail",
          dg."sequenceStep",
          dg.subject,
          dg.body,
          dg."categoryKey",
          dg.designation,
          dg."angleKey",
          dg."validatorPass",
          dg.routing,
          dg.status,
          dg."hardViolations",
          dg."softViolations",
          dg."createdAt",
          COALESCE(l."customData"->>'company', b.name) as "companyName",
          b.name as "brandName",
          l."lastContactedAt" as "leadLastContactedAt",
          (SELECT count(*) FROM "EmailEvent" ee WHERE ee."leadId" = dg."leadId")::int as "pastEventCount"
        FROM "DraftGeneration" dg
        LEFT JOIN "Lead" l ON l.id = dg."leadId"
        LEFT JOIN "Brand" b ON b.id = l."brandId"
        ${whereClause}
        ORDER BY dg."createdAt" DESC
        LIMIT ${limit}
      `);

      return sendJson(res, 200, { drafts: rows.rows });
    }

    // 2. POST /api/brain/approve
    if (pathname === '/api/brain/approve' && method === 'POST') {
      const body = await parseBody(req);
      const { draftId, action } = body; // action: 'APPROVED' | 'REJECTED'
      if (!draftId || !['APPROVED', 'REJECTED'].includes(action)) {
        return sendJson(res, 400, { error: 'Invalid draftId or action' });
      }

      await db.query(
        `UPDATE "DraftGeneration" SET status = $1 WHERE id = $2`,
        [action, draftId]
      );

      return sendJson(res, 200, { success: true, draftId, status: action });
    }

    // 3. GET /api/brain/proposals
    if (pathname === '/api/brain/proposals' && method === 'GET') {
      const rows = await db.query(`
        SELECT "id", "kind", "diffJson", "rationale", "evidence", "status", "rolloutPct", "createdAt"
        FROM "ChangeProposal"
        ORDER BY "createdAt" DESC
        LIMIT 50
      `);

      return sendJson(res, 200, { proposals: rows.rows });
    }

    // 4. POST /api/brain/approve-proposal
    if (pathname === '/api/brain/approve-proposal' && method === 'POST') {
      const body = await parseBody(req);
      const { proposalId, action } = body; // action: 'APPROVED' | 'REJECTED'
      if (!proposalId || !['APPROVED', 'REJECTED'].includes(action)) {
        return sendJson(res, 400, { error: 'Invalid proposalId or action' });
      }

      await db.query(
        `UPDATE "ChangeProposal" SET "status" = $1 WHERE "id" = $2`,
        [action, proposalId]
      );

      return sendJson(res, 200, { success: true, proposalId, status: action });
    }

    // ===== PIE (Partnership Intelligence Engine) =====

    // 5. GET /api/brain/theses — list partnership theses (gated review queue)
    if (pathname === '/api/brain/theses' && method === 'GET') {
      const limit = Number.parseInt(url.searchParams.get('limit') || '100', 10);
      const rows = await db.query(
        `
        SELECT t.id, t."brandId", t."fitScore", t.tier, t."recommendedMotion",
               t."ownerApproved", t."sharpnessRating", t."headlineGapId", t."createdAt",
               b.name AS "brandName", b.domain AS "brandDomain",
               (SELECT count(*) FROM "Gap" g WHERE g."brandId" = t."brandId" AND g."isValid" = true)::int AS "gapCount"
        FROM "PartnershipThesis" t
        LEFT JOIN "Brand" b ON b.id = t."brandId"
        ORDER BY t."fitScore" DESC
        LIMIT $1
        `,
        [limit]
      );
      return sendJson(res, 200, { theses: rows.rows });
    }

    // 6. GET /api/brain/thesis?brandId=... — one thesis + its ranked, grounded gaps
    if (pathname === '/api/brain/thesis' && method === 'GET') {
      const brandId = url.searchParams.get('brandId') || '';
      if (!brandId) return sendJson(res, 400, { error: 'brandId required' });
      const t = await db.query(
        `SELECT t.*, b.name AS "brandName", b.domain AS "brandDomain",
                d.completeness AS "dossierCompleteness", d."categoryKey" AS "dossierCategory"
         FROM "PartnershipThesis" t
         LEFT JOIN "Brand" b ON b.id = t."brandId"
         LEFT JOIN "BrandDossier" d ON d."brandId" = t."brandId"
         WHERE t."brandId" = $1 LIMIT 1`,
        [brandId]
      );
      const gaps = await db.query(
        `SELECT g.id, g.observation, g."observationSource", g."benchmarkDim", g."benchmarkValue",
                g."impliedProblem", g."businessImpact", g.confidence, g.severity, g."rankInThesis",
                c.name AS "capabilityName", p."clientName" AS "proofClient",
                p."metricRaw" AS "proofMetric", p."categoryKey" AS "proofCategory"
         FROM "Gap" g
         LEFT JOIN "Capability" c ON c.id = g."capabilityId"
         LEFT JOIN "CapabilityProof" p ON p.id = g."proofId"
         WHERE g."brandId" = $1 AND g."isValid" = true
         ORDER BY g."rankInThesis" ASC NULLS LAST`,
        [brandId]
      );
      return sendJson(res, 200, { thesis: t.rows[0] || null, gaps: gaps.rows });
    }

    // 7. POST /api/brain/thesis/approve — { brandId, action, sharpnessRating }
    if (pathname === '/api/brain/thesis/approve' && method === 'POST') {
      const body = await parseBody(req);
      const { brandId, action, sharpnessRating } = body; // action: APPROVED|REJECTED
      if (!brandId || !['APPROVED', 'REJECTED'].includes(action)) {
        return sendJson(res, 400, { error: 'Invalid brandId or action' });
      }
      const rating =
        typeof sharpnessRating === 'number' && sharpnessRating >= 1 && sharpnessRating <= 5
          ? sharpnessRating
          : null;
      await db.query(
        `UPDATE "PartnershipThesis"
         SET "ownerApproved" = $1, "sharpnessRating" = COALESCE($2, "sharpnessRating"), "approvedAt" = NOW()
         WHERE "brandId" = $3`,
        [action === 'APPROVED', rating, brandId]
      );
      return sendJson(res, 200, { success: true, brandId, status: action, sharpnessRating: rating });
    }

    // 8. GET /api/brain/pie/pending — gated Phase-0 rows awaiting owner approval
    if (pathname === '/api/brain/pie/pending' && method === 'GET') {
      const caps = await db.query(
        `SELECT c.id, c.name, c.slug, c."problemSolved", c."categoryKeys", c.active,
                COALESCE(json_agg(json_build_object(
                  'id', p.id, 'clientName', p."clientName", 'categoryKey', p."categoryKey",
                  'metricRaw', p."metricRaw", 'approvedToMention', p."approvedToMention"
                )) FILTER (WHERE p.id IS NOT NULL), '[]') AS proofs
         FROM "Capability" c
         LEFT JOIN "CapabilityProof" p ON p."capabilityId" = c.id
         GROUP BY c.id ORDER BY c.name`
      );
      const bms = await db.query(
        `SELECT id, "categoryKey", dimension, "leaderPattern", source, confidence, approved
         FROM "CategoryBenchmark" ORDER BY "categoryKey", dimension`
      );
      return sendJson(res, 200, { capabilities: caps.rows, benchmarks: bms.rows });
    }

    // 9. POST /api/brain/pie/approve — { kind, id, approve }
    if (pathname === '/api/brain/pie/approve' && method === 'POST') {
      const body = await parseBody(req);
      const { kind, id, approve } = body; // kind: capability|proof|benchmark
      if (!id || typeof approve !== 'boolean') return sendJson(res, 400, { error: 'id and approve required' });
      if (kind === 'capability') {
        await db.query(`UPDATE "Capability" SET active = $1, "updatedAt" = NOW() WHERE id = $2`, [approve, id]);
      } else if (kind === 'proof') {
        await db.query(`UPDATE "CapabilityProof" SET "approvedToMention" = $1 WHERE id = $2`, [approve, id]);
      } else if (kind === 'benchmark') {
        await db.query(`UPDATE "CategoryBenchmark" SET approved = $1, "updatedAt" = NOW() WHERE id = $2`, [approve, id]);
      } else {
        return sendJson(res, 400, { error: 'Invalid kind' });
      }
      return sendJson(res, 200, { success: true, kind, id, approve });
    }

    // 10. POST /api/brain/pie/run — run the Gap Engine for one or more brands.
    //     Requires PIE_ENABLED; writes gated theses to Replica 3.
    if (pathname === '/api/brain/pie/run' && method === 'POST') {
      const body = await parseBody(req);
      const ids: string[] = body.brandId
        ? [body.brandId]
        : Array.isArray(body.brandIds)
        ? body.brandIds.slice(0, 25)
        : [];
      if (ids.length === 0) return sendJson(res, 400, { error: 'brandId or brandIds required' });
      const results = [];
      for (const id of ids) {
        try {
          const r = await generateThesisForBrand(id);
          results.push({
            brandId: id,
            tier: r.thesis?.tier ?? null,
            fitScore: r.thesis?.fitScore ?? null,
            validGaps: r.validGaps.length,
            withheld: r.withheldCount,
            reason: r.reason ?? null,
          });
        } catch (e: any) {
          results.push({ brandId: id, error: e?.message || 'run failed' });
        }
      }
      return sendJson(res, 200, { results });
    }

    // 11. POST /api/brain/pitch/generate — L6 Grounded Pitch Generator
    //     Synthesizes verified, grounded pitches for one contact or a batch.
    if (pathname === '/api/brain/pitch/generate' && method === 'POST') {
      const body = await parseBody(req);
      if (Array.isArray(body.contacts) && body.contacts.length > 0) {
        const batchResults = await generatePitchesForBatch(body.contacts);
        return sendJson(res, 200, { pitches: batchResults });
      } else if (body.contact) {
        const singleResult = await generateGroundedPitchForContact(body.contact);
        return sendJson(res, 200, { pitch: singleResult });
      } else {
        return sendJson(res, 400, { error: 'contact or contacts array required' });
      }
    }

    // 11b. POST /api/brain/pitch/approve — persist an approved PIE pitch (or a
    //      batch) into DraftGeneration (Replica 3) so it is stored + auditable
    //      and inbound replies attach back to it.
    if (pathname === '/api/brain/pitch/approve' && method === 'POST') {
      const body = await parseBody(req);
      if (Array.isArray(body.approvals) && body.approvals.length > 0) {
        const results = [];
        for (const a of body.approvals as ApprovePitchInput[]) {
          try { results.push(await persistApprovedPitch(a)); }
          catch (e: any) { results.push({ persisted: false, grounded: false, reason: e?.message || 'error' }); }
        }
        return sendJson(res, 200, { results });
      } else if (body.contact && body.subject) {
        const result = await persistApprovedPitch(body as ApprovePitchInput);
        return sendJson(res, 200, result);
      } else {
        return sendJson(res, 400, { error: 'contact+subject, or approvals array, required' });
      }
    }

    // 12. POST /api/brain/replies/classify — L7 reply classifier (deterministic
    //     + flagged LLM refinement). Accepts one reply or a batch; `persist:true`
    //     stores results to Replica 3 for the learning loop.
    if (pathname === '/api/brain/replies/classify' && method === 'POST') {
      const body = await parseBody(req);
      const forceLLM = Boolean(body.forceLLM);
      const persist = Boolean(body.persist);
      if (Array.isArray(body.replies) && body.replies.length > 0) {
        const results = await classifyReplies(body.replies as ClassifyReplyInput[], { forceLLM, persist });
        return sendJson(res, 200, { classifications: results });
      } else if (body.reply) {
        const result = persist
          ? await classifyReplies([body.reply as ClassifyReplyInput], { forceLLM, persist: true })
          : [await classifyReply(body.reply as ClassifyReplyInput, { forceLLM })];
        return sendJson(res, 200, { classification: result[0] });
      } else {
        return sendJson(res, 400, { error: 'reply or replies array required' });
      }
    }

    // 13. GET /api/brain/replies — list recent stored classifications for review.
    if (pathname === '/api/brain/replies' && method === 'GET') {
      const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);
      const dbClass = url.searchParams.get('dbClassification');
      const params: any[] = [];
      let where = '';
      if (dbClass) { params.push(dbClass); where = `WHERE "dbClassification" = $1`; }
      params.push(limit);
      const rows = await db.query(
        `SELECT id,"leadId","leadEmail","campaignId","sequenceStep",subject,"replyText",
                "auditLabel","dbClassification","objectionType",method,confidence,reason,reviewed,"createdAt"
         FROM "ReplyClassification" ${where}
         ORDER BY "createdAt" DESC LIMIT $${params.length}`,
        params
      );
      return sendJson(res, 200, { replies: rows.rows });
    }

    // 14. POST /api/brain/learning/run — L7 analytics: mine the reply store into
    //     gated ChangeProposal rows (never auto-applied).
    if (pathname === '/api/brain/learning/run' && method === 'POST') {
      const body = await parseBody(req);
      const out = await computeChangeProposals({
        minSample: body.minSample, promoteAt: body.promoteAt, demoteAt: body.demoteAt,
      });
      return sendJson(res, 200, out);
    }

    // 15. GET /api/brain/learning/proposals — list tuning proposals for review.
    if (pathname === '/api/brain/learning/proposals' && method === 'GET') {
      const status = url.searchParams.get('status') || undefined;
      const limit = Number.parseInt(url.searchParams.get('limit') || '100', 10);
      const rows = await listChangeProposals(status, limit);
      return sendJson(res, 200, { proposals: rows });
    }

    // 16. POST /api/brain/learning/proposals/update — human gate: approve/dismiss.
    if (pathname === '/api/brain/learning/proposals/update' && method === 'POST') {
      const body = await parseBody(req);
      const allowed = ['APPROVED', 'DISMISSED', 'APPLIED', 'PROPOSED'];
      if (!body.id || !allowed.includes(body.status)) {
        return sendJson(res, 400, { error: 'id and valid status required' });
      }
      const ok = await setChangeProposalStatus(body.id, body.status);
      return sendJson(res, ok ? 200 : 404, ok ? { success: true } : { error: 'proposal not found' });
    }

    // 17. POST /api/brain/inbound/run — automated inbound-reply loop for the given
    //     mailboxes (LLM reads each reply, agent decides, notifications fire). Never sends.
    if (pathname === '/api/brain/inbound/run' && method === 'POST') {
      const body = await parseBody(req);
      if (!Array.isArray(body.mailboxes) || body.mailboxes.length === 0) {
        return sendJson(res, 400, { error: 'mailboxes array required' });
      }
      const out = await runInboundReplyLoop({
        mailboxes: body.mailboxes, limit: body.limit, sinceDays: body.sinceDays, dryRun: Boolean(body.dryRun),
      });
      return sendJson(res, 200, out);
    }

    // 18. GET /api/brain/notifications — PIE escalations/notifications for review.
    if (pathname === '/api/brain/notifications' && method === 'GET') {
      const status = url.searchParams.get('status') || undefined;
      const limit = Number.parseInt(url.searchParams.get('limit') || '100', 10);
      const rows = await listPieNotifications(status, limit);
      return sendJson(res, 200, { notifications: rows });
    }

    // 19. POST /api/brain/notifications/ack — mark a PIE notification acknowledged.
    if (pathname === '/api/brain/notifications/ack' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.id) return sendJson(res, 400, { error: 'id required' });
      const ok = await ackPieNotification(body.id);
      return sendJson(res, ok ? 200 : 404, ok ? { success: true } : { error: 'not found' });
    }

    return sendJson(res, 404, { error: 'Brain endpoint not found' });
  } catch (err: any) {
    console.error('[BrainHandler Error]', err);
    return sendJson(res, 500, { error: err.message || 'Internal error' });
  }
}

export default brainHandler;

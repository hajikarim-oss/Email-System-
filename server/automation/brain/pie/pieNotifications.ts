// ============================================================================
// PIE Layer 7 — Notifications / escalation delivery
// The conversation agent calls notifyUser() whenever a thread needs a human.
// Writes to the Replica-3 "PieNotification" store. To surface in the app's UI
// bell at go-live, bridge one row into the app "Notification" table (see note in
// the migration) — kept isolated here for build/test.
// ============================================================================

import * as crypto from 'crypto';
import { db } from '../../../db';
import { pgQuery } from '../../../pg';
import { getBrainFlags } from '../config';

export type NotificationCategory =
  | 'MEETING_REQUEST' | 'HUMAN_HANDOFF' | 'PRICING' | 'LEGAL'
  | 'HOSTILE' | 'UNSUBSCRIBE' | 'LOW_CONFIDENCE';

export interface NotifyInput {
  userId?: string | null;
  leadId?: string | null;
  leadEmail?: string | null;
  campaignId?: string | null;
  category: NotificationCategory;
  priority?: 'HIGH' | 'NORMAL';
  title: string;
  body: string;
  reason?: string;
  conversationId?: string | null;
  turnNumber?: number | null;
}

export async function notifyUser(input: NotifyInput): Promise<{ id: string }> {
  const id = `pien_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
  await db.query(
    `INSERT INTO "PieNotification"
       (id,"userId","leadId","leadEmail","campaignId",category,priority,title,body,reason,"conversationId","turnNumber")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id, input.userId || null, input.leadId || null, input.leadEmail || null, input.campaignId || null,
      input.category, input.priority || 'NORMAL', input.title, input.body, input.reason || null,
      input.conversationId || null, input.turnNumber ?? null,
    ]
  );
  // Optionally mirror into the app's notification bell (off by default).
  if (getBrainFlags().PIE_BELL_BRIDGE_ENABLED && input.userId) {
    await bridgeToAppBell(input).catch((e) => console.warn('[pie bell bridge] skipped:', e?.message));
  }
  return { id };
}

/**
 * Mirror a PIE escalation into the app's existing "Notification" table so it shows
 * in the UI bell. Best-effort: a failure here never breaks the agent/loop. Only
 * called when PIE_BELL_BRIDGE_ENABLED is set.
 */
export async function bridgeToAppBell(input: NotifyInput): Promise<boolean> {
  try {
    await pgQuery(
      `INSERT INTO "Notification" (id, type, title, message, "userId", "leadEmail", read, "createdAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, false, NOW())`,
      [`pie_${input.category.toLowerCase()}`, input.title, input.body, input.userId, input.leadEmail || null]
    );
    return true;
  } catch (e: any) {
    console.warn('[pie bell bridge] insert failed:', e?.message);
    return false;
  }
}

export async function listPieNotifications(status?: string, limit = 100): Promise<any[]> {
  const params: any[] = [];
  let where = '';
  if (status) { params.push(status); where = `WHERE status = $1`; }
  params.push(Math.min(limit, 200));
  const r = await db.query(
    `SELECT id,"leadEmail",category,priority,title,body,reason,"turnNumber",status,"read","createdAt"
     FROM "PieNotification" ${where}
     ORDER BY (CASE WHEN priority='HIGH' THEN 0 ELSE 1 END), "createdAt" DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

export async function ackPieNotification(id: string): Promise<boolean> {
  const r = await db.query(`UPDATE "PieNotification" SET status='ACK','read'=true WHERE id=$1 RETURNING id`, [id]);
  return r.rows.length > 0;
}

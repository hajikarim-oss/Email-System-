import { db } from '../../db';
import { isWorkspaceBrandLead } from './config';

export type RouteDecision =
  | 'PROCEED'
  | 'HOLD_FATIGUE'
  | 'HOLD_EXCLUDED'
  | 'HOLD_ALREADY_CONTACTED'
  | 'HOLD_DORMANT';

export interface RouteResult {
  decision: RouteDecision;
  reason: string;
  leadId: string;
  brandId?: string | null;
  outreachState?: string;
}

export interface RouterInput {
  leadId: string;
  maxActiveContactsPerBrand?: number;
  brandCooldownDays?: number;
}

/**
 * Lead Fatigue & Safety Router (Step 3.3).
 * Evaluates brand contacts cap, lead outreach state, cooldown windows, and workspace isolation.
 */
export async function routeLead(input: RouterInput): Promise<RouteResult> {
  const { leadId, maxActiveContactsPerBrand = 3, brandCooldownDays = 14 } = input;

  // 1. Fetch Lead with Brand details
  const leadRes = await db.query(
    `
    SELECT
      l.id,
      l.email,
      l."campaignId",
      l."brandId",
      l."outreachState",
      l."isBurned",
      l."isDormant",
      l."lastContactedAt",
      l."customData",
      b.name as "brandName",
      b."lastContactedAt" as "brandLastContactedAt",
      b."burnedContacts" as "brandBurnedContacts"
    FROM "Lead" l
    LEFT JOIN "Brand" b ON b.id = l."brandId"
    WHERE l.id = $1
    `,
    [leadId]
  );

  if (leadRes.rows.length === 0) {
    throw new Error(`Lead ${leadId} not found`);
  }

  const lead = leadRes.rows[0];

  // 2. Check Fix #5: Workspace Brand Lead Isolation (Exclude Troops and Creators)
  const isWorkspace = isWorkspaceBrandLead({
    email: lead.email,
    campaignId: lead.campaignId,
    customData: lead.customData,
  });

  if (!isWorkspace) {
    return {
      decision: 'HOLD_EXCLUDED',
      reason: 'Lead belongs to Troops or Creator segment, strictly excluded from B2B Outreach Brain.',
      leadId,
      brandId: lead.brandId,
      outreachState: lead.outreachState,
    };
  }

  // 3. Check Lead Burned / DNC States
  if (
    lead.isBurned ||
    lead.outreachState === 'BURNED' ||
    lead.outreachState === 'DO_NOT_CONTACT_RECENTLY'
  ) {
    return {
      decision: 'HOLD_FATIGUE',
      reason: `Lead is marked as ${lead.outreachState || 'BURNED'}.`,
      leadId,
      brandId: lead.brandId,
      outreachState: lead.outreachState,
    };
  }

  // 4. Check Active Sequence state
  if (lead.outreachState === 'IN_SEQUENCE' || lead.outreachState === 'WARM_ACTIVE') {
    return {
      decision: 'HOLD_ALREADY_CONTACTED',
      reason: 'Lead is currently active in another sequence.',
      leadId,
      brandId: lead.brandId,
      outreachState: lead.outreachState,
    };
  }

  // 5. Check Lead Cooldown (if contacted recently)
  if (lead.lastContactedAt) {
    const daysSinceContact =
      (Date.now() - new Date(lead.lastContactedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceContact < 30) {
      return {
        decision: 'HOLD_FATIGUE',
        reason: `Lead was contacted ${Math.floor(daysSinceContact)} days ago (cooldown is 30 days).`,
        leadId,
        brandId: lead.brandId,
        outreachState: lead.outreachState,
      };
    }
  }

  // 6. Check Brand-Level Contact Cap & Cooldown
  if (lead.brandId) {
    if (lead.brandLastContactedAt) {
      const daysSinceBrandContact =
        (Date.now() - new Date(lead.brandLastContactedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceBrandContact < brandCooldownDays) {
        return {
          decision: 'HOLD_FATIGUE',
          reason: `Brand was contacted ${Math.floor(daysSinceBrandContact)} days ago (brand cooldown is ${brandCooldownDays} days).`,
          leadId,
          brandId: lead.brandId,
          outreachState: lead.outreachState,
        };
      }
    }

    // Check active leads under the same brand
    const activeUnderBrand = await db.query(
      `
      SELECT COUNT(*)::int as count
      FROM "Lead"
      WHERE "brandId" = $1 AND "outreachState" IN ('IN_SEQUENCE', 'WARM_ACTIVE')
      `,
      [lead.brandId]
    );

    if (activeUnderBrand.rows[0].count >= maxActiveContactsPerBrand) {
      return {
        decision: 'HOLD_FATIGUE',
        reason: `Brand has reached maximum active contacts cap (${activeUnderBrand.rows[0].count}/${maxActiveContactsPerBrand}).`,
        leadId,
        brandId: lead.brandId,
        outreachState: lead.outreachState,
      };
    }
  }

  return {
    decision: 'PROCEED',
    reason: 'Lead and brand cleared all safety and fatigue checks.',
    leadId,
    brandId: lead.brandId,
    outreachState: lead.outreachState,
  };
}


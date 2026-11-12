/**
 * Test TBM Internal Leads (scripts/test_tbm_internal_leads.ts)
 * 
 * Runs end-to-end AI Outreach Brain generation for internal @theboredmonkey.com leads
 * across different brand categories and designations on Replica 3.
 */

import { db } from '../server/db';
import { planAndGenerateSequence } from '../server/automation/brain/planner';

const TEST_PROFILES = [
  {
    email: 'snehal.maurya@theboredmonkey.com',
    firstName: 'Snehal',
    lastName: 'Maurya',
    brandDomain: 'theboredmonkey.com',
    brandName: 'The Bored Monkey',
    categoryKey: 'consumer_tech',
    designation: 'CMO_MARKETING_HEAD',
  },
  {
    email: 'abhishek.malghe@theboredmonkey.com',
    firstName: 'Abhishek',
    lastName: 'Malghe',
    brandDomain: 'mtrfoods.com',
    brandName: 'MTR Foods',
    categoryKey: 'food_beverages',
    designation: 'PERFORMANCE_MARKETING_MANAGER',
  },
  {
    email: 'monu@theboredmonkey.com',
    firstName: 'Monu',
    lastName: 'Kumar',
    brandDomain: 'soultravelling.in',
    brandName: 'Soultravelling',
    categoryKey: 'luggage_travel',
    designation: 'FOUNDER_CEO',
  },
  {
    email: 'meenakshi.nair@theboredmonkey.com',
    firstName: 'Meenakshi',
    lastName: 'Nair',
    brandDomain: 'luluindia.com',
    brandName: 'Lulu India',
    categoryKey: 'ecommerce_retail',
    designation: 'BRAND_MANAGER',
  },
  {
    email: 'haji.karim@theboredmonkey.com',
    firstName: 'Haji',
    lastName: 'Karim',
    brandDomain: 'bombayshavingcompany.com',
    brandName: 'Bombay Shaving Company',
    categoryKey: 'beauty_personal_care',
    designation: 'FOUNDER_CEO',
  },
];

async function main() {
  console.log('============================================================');
  console.log('Running End-to-End Brain Generation on @theboredmonkey.com Leads');
  console.log('Target: BRAIN_DB_TARGET=replica3 (Replica 3 - Singapore)');
  console.log('============================================================\n');

  const results: any[] = [];

  for (const profile of TEST_PROFILES) {
    console.log(`\n------------------------------------------------------------`);
    console.log(`Setting up lead: ${profile.email}`);
    console.log(`Persona: ${profile.categoryKey} | ${profile.designation} | Brand: ${profile.brandName}`);

    // 1. Fetch or create Brand ID
    let brandRow = await db.query(
      `SELECT id, name, domain FROM "Brand" WHERE domain = $1 LIMIT 1`,
      [profile.brandDomain]
    );
    if (brandRow.rows.length === 0) {
      const brandId = `brand_${profile.brandDomain.replace(/[^a-z0-9]/g, '_')}`;
      await db.query(
        `INSERT INTO "Brand" (id, name, domain, tier, "createdAt", "updatedAt")
         VALUES ($1, $2, $3, 'GROWTH', NOW(), NOW())
         ON CONFLICT (domain) DO NOTHING`,
        [brandId, profile.brandName, profile.brandDomain]
      );
      brandRow = await db.query(
        `SELECT id, name, domain FROM "Brand" WHERE domain = $1 LIMIT 1`,
        [profile.brandDomain]
      );
    }
    const brand = brandRow.rows[0];

    // 2. Find or update the Lead row on Replica 3
    const existingLead = await db.query(
      `SELECT id FROM "Lead" WHERE lower(email) = $1 ORDER BY "createdAt" DESC LIMIT 1`,
      [profile.email.toLowerCase()]
    );

    let leadId: string;
    if (existingLead.rows.length > 0) {
      leadId = existingLead.rows[0].id;
      await db.query(
        `
        UPDATE "Lead"
        SET 
          "brandId" = $1,
          "categoryKey" = $2,
          "designation" = $3,
          "firstName" = $4,
          "lastName" = $5,
          "outreachState" = 'NEVER_REACHED',
          "isBurned" = false,
          "isDormant" = false,
          "lastContactedAt" = NULL,
          status = 'ACTIVE',
          "updatedAt" = NOW()
        WHERE id = $6
        `,
        [brand.id, profile.categoryKey, profile.designation, profile.firstName, profile.lastName, leadId]
      );
      console.log(`Updated existing lead ${leadId} with test brand profile`);
    } else {
      const crypto = await import('node:crypto');
      leadId = `lead_tbm_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
      await db.query(
        `
        INSERT INTO "Lead" (
          id, email, "firstName", "lastName", "brandId", "categoryKey", "designation",
          "outreachState", "isBurned", "isDormant", status, source, "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'NEVER_REACHED', false, false, 'ACTIVE', 'tbm_test', NOW(), NOW())
        `,
        [leadId, profile.email, profile.firstName, profile.lastName, brand.id, profile.categoryKey, profile.designation]
      );
      console.log(`Created new lead ${leadId}`);
    }

    // Reset Brand lastContactedAt to bypass brand-level cooldown in testing
    await db.query(
      `UPDATE "Brand" SET "lastContactedAt" = NULL WHERE id = $1`,
      [brand.id]
    );

    // 3. Run Brain Generation Pipeline
    console.log(`Running Brain Generation Pipeline for lead ${leadId}...`);
    try {
      const result = await planAndGenerateSequence({ leadId });
      console.log(`Generated 3-step sequence successfully!`);
      console.log(`Draft IDs: ${result.draftGenerationIds.join(', ')}`);

      result.steps.forEach((s) => {
        console.log(`\n  [Step ${s.stepNumber}] Subject: ${s.subject}`);
        console.log(`  Validation: ${s.validation.valid ? 'PASSED (0 errors)' : 'FLAGGED'}`);
        if (!s.validation.valid) {
          const allV = [...(s.validation.issues || [])];
          console.log(`  Violations: ${allV.map((i: any) => i.message).join(', ') || 'None'}`);
        }
        console.log(`  Body preview:\n${s.body.split('\n').map((l) => '    ' + l).join('\n')}`);
      });

      results.push({
        email: profile.email,
        brand: profile.brandName,
        designation: profile.designation,
        category: profile.categoryKey,
        draftIds: result.draftGenerationIds,
        allValid: result.allValid,
      });
    } catch (err: any) {
      console.error(`Error generating sequence for ${profile.email}:`, err.message);
    }
  }

  console.log(`\n============================================================`);
  console.log(`TBM Test Leads Execution Complete!`);
  console.log(`Total Leads Processed: ${results.length}/${TEST_PROFILES.length}`);
  console.log(`Drafts Created on Replica 3: ${results.length * 3}`);
  console.log(`Status: PENDING_REVIEW (Human Gate Enforced)`);
  console.log(`Reviewable in Brain Review UI at: http://localhost:5173/app/brain`);
  console.log(`============================================================\n`);
}

main().catch((err) => {
  console.error('Fatal error running TBM internal leads test:', err);
  process.exit(1);
});

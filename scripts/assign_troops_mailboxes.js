/**
 * Scripts to assign or register dedicated sender mailboxes exclusively for Troops Outreach.
 * Usage:
 *   node scripts/assign_troops_mailboxes.js email1@domain.com email2@domain.com ...
 *   node scripts/assign_troops_mailboxes.js --list
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const https = require('https');

function resolveDatabaseUrl() {
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
    const candidates = [
        path.join(__dirname, '..', 'nexus-outbound', '.env'),
        path.join(__dirname, '..', '.env'),
        path.join(__dirname, '..', 'web', '.env'),
        path.join(__dirname, '..', 'web', '.env.local'),
    ];
    for (const f of candidates) {
        if (!fs.existsSync(f)) continue;
        const content = fs.readFileSync(f, 'utf-8');
        const directMatch = content.match(/DIRECT_URL="([^"]+)"/);
        if (directMatch) return directMatch[1].trim();
        const dbMatch = content.match(/DATABASE_URL="([^"]+)"/) || content.match(/^DATABASE_URL=(.+)$/m);
        if (dbMatch) return dbMatch[1].trim().replace(/^["']|["']$/g, '');
    }
    throw new Error("DATABASE_URL not found in .env files");
}

function getSmartleadApiKey() {
    if (process.env.SMARTLEAD_API_KEY) return process.env.SMARTLEAD_API_KEY;
    const candidates = [
        path.join(__dirname, '..', 'nexus-outbound', '.env'),
        path.join(__dirname, '..', '.env'),
    ];
    for (const f of candidates) {
        if (!fs.existsSync(f)) continue;
        const content = fs.readFileSync(f, 'utf-8');
        const match = content.match(/SMARTLEAD_API_KEY=([^\s\r\n]+)/);
        if (match) return match[1].trim();
    }
    return 'b0042f19-3f90-4910-b5de-31b1e2c8c032_ticg3c4';
}

function fetchSmartleadAccounts(apiKey) {
    return new Promise((resolve) => {
        const url = `https://server.smartlead.ai/api/v1/email-accounts?api_key=${apiKey}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve([]);
                }
            });
        }).on('error', () => resolve([]));
    });
}

async function main() {
    const dbUrl = resolveDatabaseUrl();
    const parsed = new URL(dbUrl);
    const sslmode = parsed.searchParams.get("sslmode");
    const useSsl = Boolean(sslmode) && sslmode !== "disable";
    if (useSsl) parsed.searchParams.delete("sslmode");

    const pool = new Pool({
        connectionString: parsed.toString(),
        ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });
    const apiKey = getSmartleadApiKey();

    const args = process.argv.slice(2);

    console.log("==================================================");
    console.log("📬 TROOPS OUTREACH DEDICATED MAILBOX MANAGER");
    console.log("==================================================");

    // Get Troops team and master
    const troopsMasterRes = await pool.query(`
        SELECT id, name, email FROM "User"
        WHERE lower(email) = 'pratik@theboredmonkey.com'
        LIMIT 1
    `);

    if (troopsMasterRes.rows.length === 0) {
        console.error("❌ Troops master account (pratik@theboredmonkey.com) not found in database!");
        await pool.end();
        process.exit(1);
    }

    const troopsMaster = troopsMasterRes.rows[0];

    if (args.includes('--list') || args.length === 0) {
        const troopsMailboxes = await pool.query(`
            SELECT m.id, m."senderEmail", m."providerMailboxId", m.status, u.email as "assignedUser"
            FROM "Mailbox" m
            LEFT JOIN "User" u ON u.id = m."userId"
            WHERE m."userId" IN (
                SELECT ut."userId" FROM "UserTeam" ut WHERE ut."teamId" = 'team_troops_outreach'
                UNION ALL SELECT $1
            )
        `, [troopsMaster.id]);

        console.log(`\nCurrently Assigned Mailboxes for Troops Outreach (${troopsMailboxes.rows.length}):`);
        if (troopsMailboxes.rows.length === 0) {
            console.log("  (No dedicated mailboxes assigned yet. Waiting for email list.)");
        } else {
            console.table(troopsMailboxes.rows);
        }

        console.log("\nTo assign mailboxes, run:");
        console.log("  node scripts/assign_troops_mailboxes.js email1@domain.com email2@domain.com");
        await pool.end();
        return;
    }

    const emailsToAssign = args.filter(a => a.includes('@')).map(e => e.trim().toLowerCase());
    if (emailsToAssign.length === 0) {
        console.log("No valid email addresses provided.");
        await pool.end();
        return;
    }

    console.log(`\nAttempting to link ${emailsToAssign.length} sender accounts to Troops Outreach...`);

    // Fetch accounts from Smartlead to match providerMailboxIds
    const slAccounts = await fetchSmartleadAccounts(apiKey);
    const slMap = new Map();
    if (Array.isArray(slAccounts)) {
        for (const acc of slAccounts) {
            const email = (acc.from_email || acc.email || "").toLowerCase().trim();
            if (email) slMap.set(email, acc);
        }
    }

    for (const email of emailsToAssign) {
        if (email === 'kumar.monu@theboredmonkey.com' || email.includes('monu@')) {
            console.error(`❌ BLOCKED: ${email} is reserved exclusively for TheBoredMonkey master and cannot be linked to Troops.`);
            continue;
        }

        const slAccount = slMap.get(email);
        const providerId = slAccount ? String(slAccount.id) : null;

        let targetUserId = troopsMaster.id;
        if (email.includes("naveen")) {
            const navRes = await pool.query(`SELECT id FROM "User" WHERE lower(email) LIKE '%naveen%' OR id = 'usr_troops_87e6f943' LIMIT 1`);
            if (navRes.rows.length > 0) targetUserId = navRes.rows[0].id;
        } else if (email.includes("meenakshi")) {
            const meeRes = await pool.query(`SELECT id FROM "User" WHERE lower(email) LIKE '%meenakshi%' OR id = 'usr_troops_4d72a76b' LIMIT 1`);
            if (meeRes.rows.length > 0) targetUserId = meeRes.rows[0].id;
        }

        // Upsert mailbox
        const existing = await pool.query('SELECT id FROM "Mailbox" WHERE lower("senderEmail") = $1', [email]);
        if (existing.rows.length > 0) {
            await pool.query(`
                UPDATE "Mailbox"
                SET "userId" = $1,
                    "providerMailboxId" = coalesce($2, "providerMailboxId"),
                    status = 'ACTIVE',
                    "updatedAt" = now()
                WHERE id = $3
            `, [targetUserId, providerId, existing.rows[0].id]);
            console.log(`✓ Reassigned existing mailbox: ${email} ➔ User ID: ${targetUserId} (Smartlead ID: ${providerId || 'local'})`);
        } else {
            const newId = `mbx_troops_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            await pool.query(`
                INSERT INTO "Mailbox" (id, "userId", "senderEmail", "providerMailboxId", provider, status, "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, 'google', 'ACTIVE', now(), now())
            `, [newId, targetUserId, email, providerId]);
            console.log(`✓ Registered new mailbox: ${email} ➔ User ID: ${targetUserId} (Smartlead ID: ${providerId || 'local'})`);
        }
    }

    console.log("\n✅ Troops mailbox assignment complete! These senders will now be used exclusively for Troops outreach.");
    await pool.end();
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});

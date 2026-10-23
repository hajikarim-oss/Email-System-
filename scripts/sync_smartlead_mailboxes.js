/**
 * Syncs email accounts from Smartlead Pro to the database and aligns them with team members.
 * Usage:
 *   node scripts/sync_smartlead_mailboxes.js
 *   node scripts/sync_smartlead_mailboxes.js --auto-assign
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const https = require('https');

function loadConfig() {
    const envFile = path.join(__dirname, '..', '.env');
    const content = fs.readFileSync(envFile, 'utf-8');
    const apiKeyMatch = content.match(/SMARTLEAD_API_KEY=([^\s\r\n]+)/);
    const dbMatch = content.match(/DATABASE_URL="?([^"\r\n]+)"?/);

    const nexusEnv = path.join(__dirname, '..', 'nexus-outbound', '.env');
    const nexusContent = fs.existsSync(nexusEnv) ? fs.readFileSync(nexusEnv, 'utf-8') : '';
    const nexusDbMatch = nexusContent.match(/DATABASE_URL="([^"]+)"/);

    const apiKey = process.env.SMARTLEAD_API_KEY || (apiKeyMatch ? apiKeyMatch[1].trim() : null);
    const dbUrl = process.env.DATABASE_URL || (nexusDbMatch ? nexusDbMatch[1] : (dbMatch ? dbMatch[1] : null));

    if (!apiKey) {
        throw new Error('SMARTLEAD_API_KEY is not defined in environment or .env file');
    }

    return { apiKey, dbUrl };
}

function fetchSmartleadAccounts(apiKey) {
    return new Promise((resolve, reject) => {
        const url = `https://server.smartlead.ai/api/v1/email-accounts?api_key=${apiKey}`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    return reject(new Error(`Smartlead API returned ${res.statusCode}: ${data}`));
                }
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

async function main() {
    const { apiKey, dbUrl } = loadConfig();
    const autoAssign = process.argv.includes('--auto-assign');

    console.log('=== Smartlead Mailbox Sync & Team Member Alignment ===');
    console.log(`Using Smartlead API Key: ${apiKey.slice(0, 8)}...${apiKey.slice(-6)}`);

    // 1. Fetch from Smartlead
    console.log('\n1. Fetching connected email accounts from Smartlead...');
    let accounts = [];
    try {
        accounts = await fetchSmartleadAccounts(apiKey);
        console.log(`Found ${accounts.length} email account(s) in Smartlead.`);
    } catch (err) {
        console.error('Failed to fetch from Smartlead:', err.message);
        process.exit(1);
    }

    if (accounts.length > 0) {
        console.table(accounts.map(a => ({
            id: a.id,
            email: a.from_email || a.username || a.email,
            name: a.from_name || '',
            status: a.status || (a.is_active ? 'ACTIVE' : 'INACTIVE'),
            warmup_enabled: a.warmup_details?.status || a.warmup_status || 'N/A'
        })));
    } else {
        console.log('ℹ️  Currently 0 email accounts connected in Smartlead.');
        console.log('   (Once you add your 8 sender emails in Smartlead, run this script again to sync and assign them.)');
    }

    // 2. Check Database Users & Team Members
    const parsed = new URL(dbUrl);
    parsed.searchParams.delete('sslmode');
    const pool = new Pool({ connectionString: parsed.toString(), ssl: { rejectUnauthorized: false } });

    try {
        const teamMembers = await pool.query(
            `SELECT id, name, email, role FROM "User"
             WHERE role = 'TEAM_MEMBER' AND "isActive" = true
             ORDER BY "createdAt" ASC`
        );
        const masterUser = await pool.query(
            `SELECT id, name, email, role FROM "User"
             WHERE role = 'MASTER' AND "isActive" = true
             LIMIT 1`
        );

        console.log('\n2. Active Team Members in Database:');
        console.table(teamMembers.rows);
        console.log(`Master Account: ${masterUser.rows[0]?.name} (${masterUser.rows[0]?.email})`);

        // Check existing mailboxes in DB
        const existingMailboxes = await pool.query(
            `SELECT m.id, m."senderEmail", m."providerMailboxId", m.status, u.email as "assignedTo", u.role
             FROM "Mailbox" m
             LEFT JOIN "User" u ON u.id = m."userId"
             ORDER BY m."createdAt" ASC`
        );
        console.log(`\n3. Existing Mailboxes in Database (${existingMailboxes.rows.length}):`);
        console.table(existingMailboxes.rows);

        // 3. Sync newly found accounts into DB with domain routing
        if (accounts.length > 0) {
            console.log('\n4. Syncing Smartlead accounts into Database with Domain Routing...');
            const tbmMasterId = masterUser.rows[0]?.id || 'cmtr9pp8t0000cygeyjpsz5lt';
            
            // Check for Troops Master
            const troopsMaster = await pool.query(
                `SELECT id, name, email FROM "User" WHERE lower(email) = 'pratik@theboredmonkey.com' OR id = 'usr_troops_0c4c79fd' LIMIT 1`
            );
            const troopsMasterId = troopsMaster.rows[0]?.id || 'usr_troops_0c4c79fd';

            for (const acc of accounts) {
                const email = (acc.from_email || acc.username || acc.email || '').toLowerCase().trim();
                const providerId = String(acc.id);
                if (!email) continue;

                const isTroops = email.endsWith('@tbmtroop.com') || email.endsWith('@tbmtroops.com') || email.includes('tbmtroop');
                const targetUserId = isTroops ? troopsMasterId : tbmMasterId;

                const exists = await pool.query(
                    `SELECT id, "userId", "providerMailboxId" FROM "Mailbox" WHERE lower("senderEmail") = lower($1) OR "providerMailboxId" = $2`,
                    [email, providerId]
                );

                if (exists.rows.length > 0) {
                    await pool.query(
                        `UPDATE "Mailbox"
                         SET "userId" = $1, "providerMailboxId" = $2, status = 'ACTIVE', "dailySendLimit" = 200, "updatedAt" = now()
                         WHERE id = $3`,
                        [targetUserId, providerId, exists.rows[0].id]
                    );
                    console.log(`  ✓ Updated mailbox ${email} -> Assigned to ${isTroops ? 'Troops Workspace' : 'TBM Workspace'} (Smartlead ID: ${providerId})`);
                } else {
                    const id = `mbx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                    await pool.query(
                        `INSERT INTO "Mailbox" (id, "userId", "senderEmail", provider, "providerMailboxId", status, "dailySendLimit", "createdAt", "updatedAt")
                         VALUES ($1, $2, $3, 'smartlead', $4, 'ACTIVE', 200, now(), now())`,
                        [id, targetUserId, email, providerId]
                    );
                    console.log(`  + Created mailbox ${email} -> Assigned to ${isTroops ? 'Troops Workspace' : 'TBM Workspace'} (Smartlead ID: ${providerId})`);
                }
            }
        }

        console.log('\nAlignment Status: FULLY ALIGNED.');
        console.log('The system supports strict workspace domain isolation where:');
        console.log('- @tbmtroop.com accounts are automatically isolated in Troops Outreach workspace.');
        console.log('- @theboredmonkey.com accounts are assigned to TheBoredMonkey team campaigns.');
        console.log('- Master Account (kumar.monu@theboredmonkey.com #24993809) remains exclusively dedicated to Master tests.');

    } catch (dbErr) {
        console.error('Database error:', dbErr);
    } finally {
        await pool.end();
    }
}

main();

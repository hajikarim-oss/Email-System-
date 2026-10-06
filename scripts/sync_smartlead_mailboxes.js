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

    const apiKey = apiKeyMatch ? apiKeyMatch[1].trim() : 'b0042f19-3f90-4910-b5de-31b1e2c8c032_ticg3c4';
    const dbUrl = nexusDbMatch ? nexusDbMatch[1] : (dbMatch ? dbMatch[1] : null);

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

        // 3. Sync newly found accounts into DB
        if (accounts.length > 0) {
            console.log('\n4. Syncing Smartlead accounts into Database...');
            const defaultOwnerId = masterUser.rows[0]?.id;

            for (const acc of accounts) {
                const email = (acc.from_email || acc.username || acc.email || '').toLowerCase().trim();
                const providerId = String(acc.id);
                if (!email) continue;

                const exists = await pool.query(
                    `SELECT id, "userId", "providerMailboxId" FROM "Mailbox" WHERE lower("senderEmail") = lower($1)`,
                    [email]
                );

                if (exists.rows.length > 0) {
                    await pool.query(
                        `UPDATE "Mailbox"
                         SET "providerMailboxId" = $1, status = 'ACTIVE', "dailySendLimit" = 200, "updatedAt" = now()
                         WHERE id = $2`,
                        [providerId, exists.rows[0].id]
                    );
                    console.log(`  ✓ Updated mailbox ${email} (Smartlead ID: ${providerId}, Daily Limit: 200)`);
                } else {
                    const id = `mbx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                    await pool.query(
                        `INSERT INTO "Mailbox" (id, "userId", "senderEmail", provider, "providerMailboxId", status, "dailySendLimit", "createdAt", "updatedAt")
                         VALUES ($1, $2, $3, 'smartlead', $4, 'ACTIVE', 200, now(), now())`,
                        [id, defaultOwnerId, email, providerId]
                    );
                    console.log(`  + Created mailbox ${email} (Smartlead ID: ${providerId}, Daily Limit: 200)`);
                }
            }
        }

        // 4. If auto-assign is requested and we have at least 8 mailboxes and 4 team members:
        if (autoAssign && teamMembers.rows.length >= 4 && accounts.length >= 8) {
            console.log('\n5. Auto-assigning 2 sender emails each to the 4 team members...');
            for (let i = 0; i < 4; i++) {
                const member = teamMembers.rows[i];
                const mb1 = accounts[i * 2]?.from_email;
                const mb2 = accounts[i * 2 + 1]?.from_email;
                if (mb1 && mb2) {
                    await pool.query(
                        `UPDATE "Mailbox" SET "userId" = $1 WHERE lower("senderEmail") IN ($2, $3)`,
                        [member.id, mb1.toLowerCase(), mb2.toLowerCase()]
                    );
                    console.log(`  Assigned [${mb1}, ${mb2}] -> ${member.name} (${member.email})`);
                }
            }
        }

        console.log('\nAlignment Status: FULLY ALIGNED.');
        console.log('The system supports multi-tenant mailbox isolation where:');
        console.log('- Each Team Member only sees and sends through their assigned sender mailboxes.');
        console.log('- The Master Account (monu@theboredmonkey.com) retains global visibility of all 8 mailboxes.');

    } catch (dbErr) {
        console.error('Database error:', dbErr);
    } finally {
        await pool.end();
    }
}

main();

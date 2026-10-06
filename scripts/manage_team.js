const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const util = require('util');
const https = require('https');

const scrypt = util.promisify(crypto.scrypt);
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString("base64");
    const derived = await scrypt(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
    return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString("base64")}`;
}

async function verifyPassword(password, stored) {
    if (!stored) return false;
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, n, r, p, salt, hash] = parts;
    const derived = await scrypt(password, salt, KEYLEN, { N: Number(n), r: Number(r), p: Number(p) });
    const expected = Buffer.from(hash, "base64");
    return expected.length === derived.length && crypto.timingSafeEqual(derived, expected);
}

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
        const match = content.match(/DATABASE_URL="([^"]+)"/) || content.match(/^DATABASE_URL=(.+)$/m);
        if (match) return match[1].trim().replace(/^["']|["']$/g, '');
    }
    throw new Error("DATABASE_URL not found in .env files");
}

function getSmartleadApiKey() {
    if (process.env.SMARTLEAD_API_KEY) return process.env.SMARTLEAD_API_KEY;
    const candidates = [
        path.join(__dirname, '..', '.env'),
        path.join(__dirname, '..', 'nexus-outbound', '.env'),
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
    console.log("=================================================");
    console.log("🚀 TEAM MEMBER SETUP & SMARTLEAD MAILBOX ALIGNMENT");
    console.log("=================================================");

    const dbUrl = resolveDatabaseUrl();
    const apiKey = getSmartleadApiKey();

    const parsed = new URL(dbUrl);
    parsed.searchParams.delete('sslmode');

    const pool = new Pool({
        connectionString: parsed.toString(),
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
    });

    const snehalPassword = process.env.SNEHAL_PASSWORD || "9538564601Aa";
    const snehalEmail = "snehal.maurya@theboredmonkey.com";
    const snehalName = "Snehal Maurya";

    const vatsalEmail = "vatsal.vadecha@theboredmonkey.com";
    const masterEmail = "monu@theboredmonkey.com";

    try {
        // 1. Setup / Update Snehal Maurya in Database
        console.log(`\n1. Configuring Team Member: ${snehalName} (${snehalEmail})`);
        const snehalHash = await hashPassword(snehalPassword);

        const existingSnehal = await pool.query(
            `SELECT id, email, name, role, "isActive" FROM "User" WHERE LOWER(email) = LOWER($1)`,
            [snehalEmail]
        );

        let snehalUserId;
        if (existingSnehal.rows.length === 0) {
            const insertRes = await pool.query(
                `INSERT INTO "User" (id, email, name, password, role, "isActive", "createdAt", "updatedAt")
                 VALUES ($1, $2, $3, $4, 'TEAM_MEMBER', true, now(), now())
                 RETURNING id`,
                [`usr_tm_${crypto.randomBytes(4).toString('hex')}`, snehalEmail, snehalName, snehalHash]
            );
            snehalUserId = insertRes.rows[0].id;
            console.log(`  ✓ Created user record with ID: ${snehalUserId}`);
        } else {
            snehalUserId = existingSnehal.rows[0].id;
            await pool.query(
                `UPDATE "User"
                 SET password = $1,
                     role = 'TEAM_MEMBER',
                     "isActive" = true,
                     name = $2,
                     "updatedAt" = now()
                 WHERE id = $3`,
                [snehalHash, snehalName, snehalUserId]
            );
            console.log(`  ✓ Updated password & active status for user ID: ${snehalUserId}`);
        }

        // Revoke old sessions so Snehal logs in cleanly
        await pool.query(`DELETE FROM "Session" WHERE "userId" = $1`, [snehalUserId]);
        const verifyCheck = await pool.query(`SELECT password FROM "User" WHERE id = $1`, [snehalUserId]);
        const isSnehalPassValid = await verifyPassword(snehalPassword, verifyCheck.rows[0].password);
        console.log(`  ✓ Password verification check for ${snehalEmail}: ${isSnehalPassValid ? 'PASSED (scrypt verified)' : 'FAILED'}`);

        // 2. Ensure Vatsal is active
        console.log(`\n2. Verifying Team Member: Vatsal Vadecha (${vatsalEmail})`);
        const vatsalCheck = await pool.query(
            `SELECT id, email, role, "isActive" FROM "User" WHERE LOWER(email) = LOWER($1)`,
            [vatsalEmail]
        );
        if (vatsalCheck.rows.length > 0) {
            await pool.query(
                `UPDATE "User" SET role = 'TEAM_MEMBER', "isActive" = true WHERE id = $1`,
                [vatsalCheck.rows[0].id]
            );
            console.log(`  ✓ Vatsal Vadecha confirmed active TEAM_MEMBER (ID: ${vatsalCheck.rows[0].id})`);
        }

        // 3. Keep exactly TWO team members: Vatsal and Snehal
        console.log(`\n3. Ensuring ONLY two team members exist (Vatsal & Snehal)`);
        const deactivated = await pool.query(
            `UPDATE "User"
             SET "isActive" = false
             WHERE role = 'TEAM_MEMBER'
               AND LOWER(email) NOT IN (LOWER($1), LOWER($2))
             RETURNING email, name`,
            [vatsalEmail, snehalEmail]
        );
        if (deactivated.rows.length > 0) {
            console.log(`  ✓ Deactivated other team members to keep exactly two:`);
            deactivated.rows.forEach(r => console.log(`    - ${r.name} (${r.email})`));
        } else {
            console.log(`  ✓ Only Vatsal and Snehal are active team members.`);
        }

        // 4. Fetch live email accounts from Smartlead
        console.log(`\n4. Fetching accounts from Smartlead (${apiKey.slice(0, 8)}...)...`);
        const slAccounts = await fetchSmartleadAccounts(apiKey);
        console.log(`  ✓ Found ${slAccounts.length} email account(s) in Smartlead:`);
        slAccounts.forEach(a => console.log(`    - ID: ${a.id} | Email: ${a.from_email || a.email} | Name: ${a.from_name || a.name}`));

        // 5. Sync Smartlead mailboxes in Database
        console.log(`\n5. Aligning Database Mailboxes with Smartlead accounts...`);
        const masterRes = await pool.query(
            `SELECT id FROM "User" WHERE role = 'MASTER' AND "isActive" = true LIMIT 1`
        );
        const masterId = masterRes.rows[0]?.id || "cmtr9pp8t0000cygeyjpsz5lt";

        for (const acc of slAccounts) {
            const accEmail = (acc.from_email || acc.email || '').toLowerCase().trim();
            const providerId = String(acc.id);
            const isVatsal = accEmail.includes('vatsal');
            const isSnehal = accEmail.includes('snehal');
            const isMaster = accEmail.includes('haji') || accEmail.includes('tamanna') || accEmail.includes('monu');

            // Find owner user ID
            const targetUser = isVatsal ? vatsalCheck.rows[0]?.id : (isSnehal ? snehalUserId : masterId);

            // Check if mailbox exists
            const existingMb = await pool.query(
                `SELECT id FROM "Mailbox" WHERE LOWER("senderEmail") = LOWER($1) OR "providerMailboxId" = $2`,
                [accEmail, providerId]
            );

            if (existingMb.rows.length === 0) {
                await pool.query(
                    `INSERT INTO "Mailbox" (id, "userId", "senderEmail", provider, "providerMailboxId", status, "dailySendLimit", "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, 'smartlead', $4, 'ACTIVE', 200, now(), now())`,
                    [`mbx_${acc.id}`, targetUser, accEmail, providerId]
                );
                console.log(`  ✓ Added Mailbox: ${accEmail} -> assigned to userId: ${targetUser} (Smartlead ID: ${providerId})`);
            } else {
                await pool.query(
                    `UPDATE "Mailbox"
                     SET "userId" = $1,
                         "senderEmail" = $2,
                         "providerMailboxId" = $3,
                         status = 'ACTIVE',
                         "dailySendLimit" = 200,
                         "updatedAt" = now()
                     WHERE id = $4`,
                    [targetUser, accEmail, providerId, existingMb.rows[0].id]
                );
                console.log(`  ✓ Updated Mailbox: ${accEmail} -> assigned to userId: ${targetUser} (Smartlead ID: ${providerId})`);
            }
        }

        // Deactivate/pause mailboxes not present in Smartlead active accounts
        const activeEmails = slAccounts.map(a => (a.from_email || a.email || '').toLowerCase().trim()).filter(Boolean);
        if (activeEmails.length > 0) {
            await pool.query(
                `UPDATE "Mailbox" SET status = 'PAUSED' WHERE LOWER("senderEmail") NOT IN (${activeEmails.map((_, i) => `$${i + 1}`).join(', ')})`,
                activeEmails
            );
        }

        // 6. Print Summary
        console.log("\n=================================================");
        console.log("📋 FINAL VERIFICATION TABLE");
        console.log("=================================================");
        const finalUsers = await pool.query(
            `SELECT id, email, name, role, "isActive" FROM "User" WHERE "isActive" = true ORDER BY role, name`
        );
        console.table(finalUsers.rows);

        const finalMailboxes = await pool.query(
            `SELECT m.id, m."senderEmail", m."providerMailboxId", m.status, u.email as "assignedTo", u.role, m."dailySendLimit"
             FROM "Mailbox" m
             LEFT JOIN "User" u ON u.id = m."userId"
             WHERE m.status = 'ACTIVE'
             ORDER BY m."senderEmail"`
        );
        console.table(finalMailboxes.rows);

        console.log("\n✅ ALL DATABASE CREDENTIALS & SMARTLEAD MAILBOXES CONFIGURED.");
    } catch (err) {
        console.error("Error during setup:", err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main().catch(console.error);

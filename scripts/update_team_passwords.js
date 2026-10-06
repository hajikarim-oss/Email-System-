const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const util = require('util');

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

function getDbUrl() {
    const candidates = [
        path.join(__dirname, '..', 'nexus-outbound', '.env'),
        path.join(__dirname, '..', '.env'),
        path.join(__dirname, '..', 'web', '.env'),
    ];
    for (const f of candidates) {
        if (!fs.existsSync(f)) continue;
        const content = fs.readFileSync(f, 'utf-8');
        const match = content.match(/DATABASE_URL="([^"]+)"/) || content.match(/^DATABASE_URL=(.+)$/m);
        if (match) return match[1].trim().replace(/^["']|["']$/g, '');
    }
    throw new Error("DATABASE_URL not found");
}

async function main() {
    const dbUrl = getDbUrl();
    const parsed = new URL(dbUrl);
    parsed.searchParams.delete('sslmode');

    const pool = new Pool({
        connectionString: parsed.toString(),
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
    });

    const targetPassword = process.env.TEAM_PASSWORD || process.argv[2] || "TheBoredMonkey@2026!";
    const teamMembers = [
        { email: "vatsal.vadecha@theboredmonkey.com", name: "Vatsal Vadecha" },
        { email: "snehal.maurya@theboredmonkey.com", name: "Snehal Maurya" },
    ];

    console.log("=== Setting Unified Team Password for Vatsal & Snehal ===");
    console.log(`Password: ${targetPassword}`);

    try {
        const newHash = await hashPassword(targetPassword);

        for (const tm of teamMembers) {
            // 1. Ensure user exists and update credentials
            const existing = await pool.query(
                `SELECT id, email, name, role, "isActive" FROM "User" WHERE LOWER(email) = LOWER($1)`,
                [tm.email]
            );

            let userId;
            if (existing.rows.length === 0) {
                const insertRes = await pool.query(
                    `INSERT INTO "User" (id, email, name, password, role, "isActive", "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, 'TEAM_MEMBER', true, now(), now())
                     RETURNING id`,
                    [`usr_tm_${crypto.randomBytes(4).toString('hex')}`, tm.email, tm.name, newHash]
                );
                userId = insertRes.rows[0].id;
                console.log(`✓ Created new Team Member record: ${tm.name} (${tm.email}) with ID: ${userId}`);
            } else {
                userId = existing.rows[0].id;
                await pool.query(
                    `UPDATE "User"
                     SET password = $1,
                         role = 'TEAM_MEMBER',
                         "isActive" = true,
                         name = $2,
                         "updatedAt" = now()
                     WHERE id = $3`,
                    [newHash, tm.name, userId]
                );
                console.log(`✓ Updated Team Member record: ${tm.name} (${tm.email}) with ID: ${userId}`);
            }

            // 2. Revoke old sessions
            const revoked = await pool.query(`DELETE FROM "Session" WHERE "userId" = $1`, [userId]);
            console.log(`  - Revoked ${revoked.rowCount} existing session(s)`);

            // 3. Verify password hash matches
            const verifyRes = await pool.query(`SELECT password FROM "User" WHERE id = $1`, [userId]);
            const isMatch = await verifyPassword(targetPassword, verifyRes.rows[0].password);
            console.log(`  - Password verification check: ${isMatch ? "SUCCESS (PASSED)" : "FAILED"}`);

            // 4. Update Mailbox assignment
            try {
                await pool.query(
                    `UPDATE "Mailbox"
                     SET "assignedTo" = $1,
                         role = 'TEAM_MEMBER',
                         status = 'ACTIVE'
                     WHERE LOWER("senderEmail") = LOWER($2)`,
                    [tm.email, tm.email]
                );
                console.log(`  - Aligned Mailbox ${tm.email} -> assignedTo: ${tm.email}, role: TEAM_MEMBER`);
            } catch (mErr) {
                console.warn(`  - Mailbox update note:`, mErr.message);
            }
        }

        console.log("\n--- Verification Summary ---");
        const finalUsers = await pool.query(
            `SELECT id, email, name, role, "isActive" FROM "User" WHERE LOWER(email) IN ($1, $2)`,
            [teamMembers[0].email, teamMembers[1].email]
        );
        console.table(finalUsers.rows);

        console.log("\n=== ALL TEAM MEMBER CREDENTIALS UPDATED SUCCESSFULLY ===");
    } catch (e) {
        console.error("Error updating credentials:", e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();

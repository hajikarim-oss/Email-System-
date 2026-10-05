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

function loadDatabaseUrl() {
    const candidates = [
        path.join(__dirname, "..", "nexus-outbound", ".env"),
        path.join(__dirname, "..", ".env"),
        path.join(__dirname, "..", "web", ".env"),
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
    const dbUrl = loadDatabaseUrl();
    const parsed = new URL(dbUrl);
    parsed.searchParams.delete('sslmode');

    const pool = new Pool({
        connectionString: parsed.toString(),
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
    });

    try {
        console.log("=== Updating Master Account in Database ===");
        const newEmail = process.env.MASTER_EMAIL || process.argv[2] || "monu@theboredmonkey.com";
        const newPasswordPlain = process.env.MASTER_PASSWORD || process.argv[3];
        const newApiKey = process.env.SMARTLEAD_API_KEY || process.argv[4];

        if (!newPasswordPlain) {
            console.error("Please provide MASTER_PASSWORD as an environment variable or argument: node update_master_credentials.js <email> <password> <apiKey>");
            process.exit(1);
        }
        const newHash = await hashPassword(newPasswordPlain);

        // Check current master row
        const currentMaster = await pool.query(
            `SELECT id, name, email, role FROM "User" WHERE role = 'MASTER' LIMIT 1`
        );
        const masterId = currentMaster.rows[0]?.id || 'cmtr9pp8t0000cygeyjpsz5lt';
        console.log(`Current master user ID: ${masterId}, Current Email: ${currentMaster.rows[0]?.email}`);

        // Update Master user
        await pool.query(
            `UPDATE "User"
             SET email = $1,
                 name = $2,
                 password = $3,
                 "smartleadApiKey" = $4,
                 "isActive" = true,
                 "updatedAt" = now()
             WHERE id = $5`,
            [newEmail, "Monu", newHash, newApiKey, masterId]
        );
        console.log(`Updated user ${masterId} to email: ${newEmail}, name: Monu`);

        // Revoke all existing sessions for this master user
        const revoked = await pool.query(
            `DELETE FROM "Session" WHERE "userId" = $1`,
            [masterId]
        );
        console.log(`Revoked ${revoked.rowCount} existing session(s)`);

        // Verify the update
        const updated = await pool.query(
            `SELECT id, name, email, role, password, "smartleadApiKey", "isActive"
             FROM "User" WHERE id = $1`,
            [masterId]
        );
        const user = updated.rows[0];
        console.log("Updated Master Record:", {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            smartleadApiKey: user.smartleadApiKey
        });

        // Test password verification
        const valid = await verifyPassword(newPasswordPlain, user.password);
        console.log(`Password verification:`, valid ? "SUCCESS (PASSED)" : "FAILED");

        const wrongValid = await verifyPassword("WrongPassword123", user.password);
        console.log(`Password verification with wrong password:`, wrongValid ? "FAILED (SECURITY RISK)" : "SUCCESS (CORRECTLY REJECTED)");

    } catch (e) {
        console.error("Migration error:", e);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();

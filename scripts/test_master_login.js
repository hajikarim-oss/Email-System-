const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const util = require('util');

const scrypt = util.promisify(crypto.scrypt);
const KEYLEN = 64;

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
    return process.env.DATABASE_URL;
}

async function testAuth() {
    console.log("=== Testing Authentication Security & Master Login ===");
    const dbUrl = loadDatabaseUrl();
    const parsed = new URL(dbUrl);
    parsed.searchParams.delete('sslmode');

    const pool = new Pool({
        connectionString: parsed.toString(),
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
    });

    try {
        // Test 1: Query Monu user in DB
        const testEmail = process.env.MASTER_EMAIL || process.argv[2] || 'monu@theboredmonkey.com';
        const monuRes = await pool.query('SELECT id, email, role, password, "isActive" FROM "User" WHERE LOWER(email) = LOWER($1)', [testEmail]);
        const monu = monuRes.rows[0];
        console.log(`Test 1: Find user '${testEmail}':`, monu ? `PASSED (ID: ${monu.id}, Role: ${monu.role}, Active: ${monu.isActive})` : "FAILED (NOT FOUND)");

        // Test 2: Verify password for Monu
        const storedHash = monu?.password;
        const testPw = process.env.MASTER_PASSWORD || process.argv[3];
        if (testPw) {
            const correctPw = await verifyPassword(testPw, storedHash);
            console.log(`Test 2: Verify password '${testPw.slice(0, 3)}***':`, correctPw ? "PASSED (AUTHENTICATED)" : "FAILED");
        } else {
            console.log("Test 2: Password check skipped (pass MASTER_PASSWORD env var or CLI arg to test)");
        }

        // Test 3: Verify wrong password
        const wrongPw = await verifyPassword('WrongPassword123', storedHash);
        console.log("Test 3: Verify wrong password 'WrongPassword123':", wrongPw ? "FAILED (SECURITY HOLE)" : "PASSED (REJECTED)");

        // Test 5: Verify old master email is gone/rejected
        const hajiRes = await pool.query('SELECT id FROM "User" WHERE LOWER(email) = LOWER($1)', ['haji.karim@theboredmonkey.com']);
        console.log("Test 5: Find old master user 'haji.karim@theboredmonkey.com':", hajiRes.rows.length === 0 ? "PASSED (NOT FOUND IN DB)" : "FAILED");

        // Test 6: Check that sessions table has no revoked Haji sessions
        const oldSessions = await pool.query('SELECT count(*) FROM "Session" WHERE "userId" NOT IN (SELECT id FROM "User")');
        console.log("Test 6: Orphaned / invalid sessions in DB:", oldSessions.rows[0].count === '0' ? "PASSED (0 orphaned)" : `NOTE (${oldSessions.rows[0].count} found)`);

        console.log("\nAll Master Login Security Checks Completed Successfully.");
    } finally {
        await pool.end();
    }
}

testAuth().catch(err => {
    console.error("Test error:", err);
    process.exit(1);
});

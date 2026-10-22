const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");

const ROOT = path.resolve(__dirname, "..");

function loadDatabaseUrl() {
    if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
    const candidates = [
        path.join(ROOT, "nexus-outbound", ".env"),
        path.join(ROOT, ".env"),
        path.join(ROOT, "web", ".env.local"),
        path.join(ROOT, "web", ".env"),
    ];
    for (const file of candidates) {
        if (!fs.existsSync(file)) continue;
        const line = fs
            .readFileSync(file, "utf-8")
            .split("\n")
            .map((l) => l.trim())
            .find((l) => l.startsWith("DATABASE_URL="));
        if (line) return line.slice("DATABASE_URL=".length).replace(/^["']|["']$/g, "").trim();
    }
    throw new Error("DATABASE_URL not found in environment or .env files");
}

function scryptHash(password) {
    const salt = crypto.randomBytes(16).toString("base64");
    const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
    return `scrypt$16384$8$1$${salt}$${derived.toString("base64")}`;
}

async function main() {
    console.log("=================================================");
    console.log("🚀 PROVISIONING TROOPS OUTREACH WORKSPACE & USERS");
    console.log("=================================================");

    const dbUrl = loadDatabaseUrl();
    const parsed = new URL(dbUrl);
    parsed.searchParams.delete("sslmode");

    const pool = new Pool({
        connectionString: parsed.toString(),
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000,
    });

    const PASSWORD_DEFAULT = "9538564601Aa";
    const passwordHash = scryptHash(PASSWORD_DEFAULT);

    try {
        // 1. Create or ensure Teams exist
        console.log("\n1. Ensuring Teams exist in PostgreSQL...");
        await pool.query(`
            INSERT INTO "Team" ("id", "name", "description", "createdAt", "updatedAt")
            VALUES 
                ('team_tbm_main', 'TheBoredMonkey Workspace', 'Primary Brand Outreach Workspace', NOW(), NOW()),
                ('team_troops_outreach', 'Troops Outreach', 'Troops Enterprise Outreach Workspace', NOW(), NOW())
            ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name", "description" = EXCLUDED."description", "updatedAt" = NOW()
        `);
        console.log("   ✓ 'team_tbm_main' and 'team_troops_outreach' registered.");

        // 2. Define Troops users
        const troopsUsers = [
            {
                email: "pratik@theboredmonkey.com",
                name: "Pratik",
                role: "MASTER",
            },
            {
                email: "naveen.chintala@theboredmonkey.com",
                name: "Naveen Chintala",
                role: "MASTER",
            },
            {
                email: "meenakshi.nair@theboredmonkey.com",
                name: "Meenakshi Nair",
                role: "TEAM_MEMBER",
            },
        ];

        console.log("\n2. Provisioning Troops Users...");
        for (const u of troopsUsers) {
            const check = await pool.query(
                `SELECT id, email, role FROM "User" WHERE LOWER(email) = LOWER($1)`,
                [u.email]
            );

            let userId;
            if (check.rows.length === 0) {
                userId = `usr_troops_${crypto.randomBytes(4).toString("hex")}`;
                await pool.query(
                    `INSERT INTO "User" ("id", "name", "email", "password", "role", "isActive", "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())`,
                    [userId, u.name, u.email.toLowerCase(), passwordHash, u.role]
                );
                console.log(`   ✓ Created ${u.role} user: ${u.email} (ID: ${userId})`);
            } else {
                userId = check.rows[0].id;
                await pool.query(
                    `UPDATE "User"
                     SET "name" = $1, "password" = $2, "role" = $3, "isActive" = true, "updatedAt" = NOW()
                     WHERE id = $4`,
                    [u.name, passwordHash, u.role, userId]
                );
                // Invalidate old sessions
                await pool.query(`DELETE FROM "Session" WHERE "userId" = $1`, [userId]);
                console.log(`   ✓ Updated ${u.role} user: ${u.email} (ID: ${userId})`);
            }

            // Bind to Troops team
            await pool.query(
                `INSERT INTO "UserTeam" ("userId", "teamId", "joinedAt")
                 VALUES ($1, 'team_troops_outreach', NOW())
                 ON CONFLICT ("userId", "teamId") DO NOTHING`,
                [userId]
            );
            console.log(`     → Bound ${u.email} to team_troops_outreach`);
        }

        // 3. Ensure existing TBM users are bound to team_tbm_main
        console.log("\n3. Verifying existing TBM users are bound to team_tbm_main...");
        const tbmUsers = await pool.query(
            `SELECT id, email FROM "User"
             WHERE LOWER(email) NOT IN ('pratik@theboredmonkey.com', 'naveen.chintala@theboredmonkey.com', 'meenakshi.nair@theboredmonkey.com')
               AND "isActive" = true`
        );

        for (const tu of tbmUsers.rows) {
            await pool.query(
                `INSERT INTO "UserTeam" ("userId", "teamId", "joinedAt")
                 VALUES ($1, 'team_tbm_main', NOW())
                 ON CONFLICT ("userId", "teamId") DO NOTHING`,
                [tu.id]
            );
        }
        console.log(`   ✓ ${tbmUsers.rows.length} existing users mapped to team_tbm_main.`);

        // 4. Output summary verification
        console.log("\n4. Workspace Membership Summary:");
        const summary = await pool.query(`
            SELECT t.name as team_name, t.id as team_id, u.name, u.email, u.role
            FROM "Team" t
            JOIN "UserTeam" ut ON ut."teamId" = t.id
            JOIN "User" u ON u.id = ut."userId"
            ORDER BY t.name, CASE WHEN u.role = 'MASTER' THEN 0 ELSE 1 END, u.email
        `);

        for (const row of summary.rows) {
            console.log(`   [${row.team_name}] (${row.role}) ${row.name || row.email} <${row.email}>`);
        }

        console.log("\n=================================================");
        console.log("✔ ALL TROOPS USERS & WORKSPACE PROVISIONED SUCCESSFULLY");
        console.log("=================================================");
    } catch (err) {
        console.error("Error during provisioning:", err);
    } finally {
        await pool.end();
    }
}

main();

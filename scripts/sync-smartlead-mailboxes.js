#!/usr/bin/env node
/**
 * Sync Smartlead Mailboxes to Database
 *
 * This script:
 * 1. Fetches all email accounts from Smartlead
 * 2. Creates/updates Mailbox records in PostgreSQL
 * 3. Validates all 8 sender accounts are synced
 * 4. Reports any mismatches
 */

const https = require("https");
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

function loadEnv(filePath) {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, "utf8").split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2]?.trim().replace(/^['"]|['"]$/g, "");
      }
    }
  }
}
loadEnv(path.resolve(__dirname, "../.env"));
loadEnv(path.resolve(__dirname, "../nexus-outbound/.env"));

const API_KEY = process.env.SMARTLEAD_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;
const BASE_URL = "https://server.smartlead.ai/api/v1";

if (!API_KEY) {
  console.error("❌ Error: SMARTLEAD_API_KEY not set");
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error("❌ Error: DATABASE_URL not set");
  process.exit(1);
}

function apiCall(endpoint, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const separator = endpoint.includes("?") ? "&" : "?";
    const url = `${BASE_URL}${endpoint}${separator}api_key=${API_KEY}`;
    const parsedUrl = new URL(url);

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch {
          resolve({ status: res.statusCode, data: { raw: data } });
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function fetchSmartleadMailboxes() {
  console.log("\n📧 Fetching mailboxes from Smartlead...");
  try {
    const result = await apiCall("/email-accounts");
    if (result.status === 200 && Array.isArray(result.data)) {
      console.log(`✅ Found ${result.data.length} mailboxes in Smartlead`);
      return result.data;
    } else {
      console.error("❌ Failed to fetch mailboxes:", result.data);
      return [];
    }
  } catch (err) {
    console.error("❌ API Error:", err.message);
    return [];
  }
}

async function syncMailboxesToDatabase(mailboxes) {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("\n✅ Connected to database");

    // Get master user (first master in system)
    const userResult = await client.query(
      `SELECT id FROM "User" WHERE role = 'MASTER' LIMIT 1`
    );

    if (userResult.rows.length === 0) {
      console.error("❌ No MASTER user found");
      await client.end();
      return [];
    }

    const userId = userResult.rows[0].id;
    console.log(`👤 Syncing to user: ${userId}`);

    const syncedMailboxes = [];

    for (const mailbox of mailboxes) {
      const email = mailbox.from_email || mailbox.email;
      const mailboxId = mailbox.id;

      try {
        const result = await client.query(
          `INSERT INTO "Mailbox" (id, "userId", "senderEmail", provider, "providerMailboxId", status, "createdAt", "updatedAt")
           VALUES (gen_random_uuid()::text, $1, $2, 'smartlead', $3, 'ACTIVE', NOW(), NOW())
           ON CONFLICT ("senderEmail") DO UPDATE SET "providerMailboxId" = EXCLUDED."providerMailboxId", "updatedAt" = NOW()
           RETURNING id, "senderEmail", "providerMailboxId"`,
          [userId, email, String(mailboxId)]
        );

        const syncedMailbox = result.rows[0];
        syncedMailboxes.push(syncedMailbox);
        console.log(`  ✅ ${email} (Smartlead ID: ${mailboxId})`);
      } catch (err) {
        console.error(`  ❌ Failed to sync ${email}:`, err.message);
      }
    }

    console.log(`\n📊 Sync Summary: ${syncedMailboxes.length}/${mailboxes.length} mailboxes synced`);

    // Verify sync
    const verification = await client.query(
      `SELECT "senderEmail", "providerMailboxId" FROM "Mailbox" WHERE "userId" = $1 ORDER BY "createdAt"`,
      [userId]
    );

    console.log("\n📋 Database Mailboxes:");
    verification.rows.forEach((row, i) => {
      console.log(`  ${i + 1}. ${row.senderEmail} (Provider ID: ${row.providerMailboxId})`);
    });

    await client.end();
    return syncedMailboxes;
  } catch (err) {
    console.error("❌ Database Error:", err.message);
    await client.end();
    return [];
  }
}

async function validateSync(smartleadMailboxes, syncedMailboxes) {
  console.log("\n✔️ Validation Report:");
  console.log(`   Smartlead mailboxes: ${smartleadMailboxes.length}`);
  console.log(`   Synced to database: ${syncedMailboxes.length}`);

  if (smartleadMailboxes.length === syncedMailboxes.length) {
    console.log("\n   ✅ All mailboxes synced successfully!");
  } else {
    console.log(
      `\n   ⚠️  Mismatch: ${smartleadMailboxes.length - syncedMailboxes.length} mailboxes not synced`
    );
  }

  console.log("\n📧 Smartlead Mailboxes:");
  smartleadMailboxes.forEach((m, i) => {
    const email = m.from_email || m.email;
    const isSynced = syncedMailboxes.some((s) => s.senderEmail === email);
    console.log(`   ${i + 1}. ${email} ${isSynced ? "✅" : "❌"} (ID: ${m.id})`);
  });
}

async function main() {
  console.log("🚀 Smartlead Mailbox Sync Script");
  console.log("================================\n");

  const smartleadMailboxes = await fetchSmartleadMailboxes();
  if (smartleadMailboxes.length === 0) {
    console.error("\n❌ No mailboxes to sync");
    process.exit(1);
  }

  const syncedMailboxes = await syncMailboxesToDatabase(smartleadMailboxes);
  await validateSync(smartleadMailboxes, syncedMailboxes);

  if (syncedMailboxes.length === smartleadMailboxes.length) {
    console.log("\n✅ Sync completed successfully!");
    process.exit(0);
  } else {
    console.log("\n⚠️  Sync completed with issues");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Fatal Error:", err);
  process.exit(1);
});

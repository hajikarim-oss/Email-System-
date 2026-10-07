#!/usr/bin/env node
/**
 * Verify Smartlead Mailboxes
 *
 * Fetches and displays all 8 sender mailboxes from:
 * 1. Smartlead API
 * 2. Local database
 * 3. Compares both
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

console.log("📧 Smartlead Mailbox Verification");
console.log("=================================\n");

function apiCall(endpoint) {
  return new Promise((resolve, reject) => {
    const separator = endpoint.includes("?") ? "&" : "?";
    const url = `${BASE_URL}${endpoint}${separator}api_key=${API_KEY}`;
    const parsedUrl = new URL(url);

    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: "GET",
      headers: { "Content-Type": "application/json" },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({ raw: data });
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

async function getSmartleadMailboxes() {
  console.log("🔍 Checking Smartlead Mailboxes...");
  try {
    const mailboxes = await apiCall("/email-accounts");
    if (Array.isArray(mailboxes)) {
      console.log(`✅ Found ${mailboxes.length} mailboxes in Smartlead\n`);
      console.log("📧 Smartlead Email Accounts:");
      mailboxes.forEach((m, i) => {
        const email = m.from_email || m.email;
        const status = m.status || "active";
        const warmupStatus = m.warm_up_status || "N/A";
        console.log(
          `  ${i + 1}. ${email.padEnd(40)} | ID: ${String(m.id).padEnd(8)} | Status: ${status}`
        );
      });
      return mailboxes;
    } else {
      console.error("❌ Unexpected response format");
      return [];
    }
  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    return [];
  }
}

async function getDatabaseMailboxes() {
  console.log("\n🔍 Checking Database Mailboxes...");
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();

    const result = await client.query(
      `SELECT id, "senderEmail", "providerMailboxId", status FROM "Mailbox"
       WHERE provider = 'smartlead' OR provider IS NULL
       ORDER BY "createdAt"`
    );

    if (result.rows.length === 0) {
      console.log("⚠️  No mailboxes found in database");
      return [];
    }

    console.log(`✅ Found ${result.rows.length} mailboxes in database\n`);
    console.log("📧 Database Mailboxes:");
    result.rows.forEach((m, i) => {
      console.log(
        `  ${i + 1}. ${m.senderEmail.padEnd(40)} | Provider ID: ${String(m.providerMailboxId || "N/A").padEnd(8)} | Status: ${m.status}`
      );
    });

    await client.end();
    return result.rows;
  } catch (err) {
    console.error(`❌ Database Error: ${err.message}`);
    try {
      await client.end();
    } catch {}
    return [];
  }
}

async function compareMailboxes(smartleadMailboxes, dbMailboxes) {
  console.log("\n📊 Comparison Report");
  console.log("─".repeat(50));

  const smartleadEmails = smartleadMailboxes
    .map((m) => (m.from_email || m.email).toLowerCase())
    .sort();
  const dbEmails = dbMailboxes.map((m) => m.senderEmail.toLowerCase()).sort();

  console.log(`\nSmartlead Count: ${smartleadEmails.length}`);
  console.log(`Database Count:  ${dbEmails.length}`);

  if (smartleadEmails.length === dbEmails.length) {
    console.log("\n✅ Counts match!");
  } else {
    console.log(`\n⚠️  Count mismatch (difference: ${Math.abs(smartleadEmails.length - dbEmails.length)})`);
  }

  console.log("\n✔️ Status Check:");
  let allSynced = true;
  smartleadMailboxes.forEach((sm) => {
    const email = (sm.from_email || sm.email).toLowerCase();
    const inDb = dbEmails.includes(email);
    const symbol = inDb ? "✅" : "❌";
    console.log(`  ${symbol} ${email}`);
    if (!inDb) allSynced = false;
  });

  if (allSynced && smartleadEmails.length === dbEmails.length) {
    console.log("\n🎉 All mailboxes synced perfectly!");
  } else {
    console.log(
      "\n⚠️  Some mailboxes are missing from database. Run sync script to fix."
    );
  }

  return allSynced;
}

async function main() {
  try {
    const smartleadMailboxes = await getSmartleadMailboxes();
    const dbMailboxes = await getDatabaseMailboxes();

    const isSynced = await compareMailboxes(smartleadMailboxes, dbMailboxes);

    console.log("\n" + "=".repeat(50));
    if (isSynced) {
      console.log("✅ Mailbox verification PASSED");
      process.exit(0);
    } else {
      console.log("❌ Mailbox verification FAILED - sync needed");
      console.log("\nTo sync mailboxes, run:");
      console.log("  node scripts/sync-smartlead-mailboxes.js");
      process.exit(1);
    }
  } catch (err) {
    console.error("\n❌ Fatal Error:", err.message);
    process.exit(1);
  }
}

main();

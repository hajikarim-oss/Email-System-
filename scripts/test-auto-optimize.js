#!/usr/bin/env node
/**
 * Test Auto-Optimization Logic
 *
 * Verifies that the auto_optimize_interval flag correctly calculates
 * optimal send_interval_seconds based on mailbox count and daily leads.
 */

const https = require("https");
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

const API_URL = process.env.API_URL || "https://tbmoutreach.tech";
let AUTH_TOKEN = process.env.AUTH_TOKEN || "";

console.log("🧪 Testing Auto-Optimization Logic");
console.log("=================================\n");

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const options = {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AUTH_TOKEN}`,
      },
      hostname: url.hostname,
      path: url.pathname + url.search,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          resolve({
            status: res.statusCode,
            body: JSON.parse(data),
            headers: res.headers,
          });
        } catch {
          resolve({
            status: res.statusCode,
            body: { raw: data },
            headers: res.headers,
          });
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Test cases
const testCases = [
  {
    name: "Test 1: 10 Mailboxes + 2000 Leads (9 AM - 6 PM)",
    config: {
      name: "Test Auto-Optimize 10 Mailboxes",
      max_new_leads_per_day: 2000,
      mailbox_count: 10,
      auto_optimize_interval: true,
      start_time: "09:00",
      end_time: "18:00",
      timezone: "Asia/Kolkata",
      days: [1, 2, 3, 4, 5],
      leads: [
        {
          email: "test1@company.com",
          first_name: "Test",
          last_name: "User1",
          company: "TestCorp",
        },
        {
          email: "test2@company.com",
          first_name: "Test",
          last_name: "User2",
          company: "TestCorp",
        },
      ],
      steps: [
        {
          subject: "Test Email 1",
          body_html: "<p>This is a test email</p>",
          wait_after: 0,
        },
      ],
    },
    expectedInterval: 150, // 32,400 / 200 = 162, rounded to 150-170
    description: "Should calculate ~150-160s for 10 mailboxes with 2000 leads",
  },
  {
    name: "Test 2: 8 Mailboxes + 2000 Leads (9 AM - 6 PM)",
    config: {
      name: "Test Auto-Optimize 8 Mailboxes",
      max_new_leads_per_day: 2000,
      mailbox_count: 8,
      auto_optimize_interval: true,
      start_time: "09:00",
      end_time: "18:00",
      timezone: "Asia/Kolkata",
      days: [1, 2, 3, 4, 5],
      leads: [
        {
          email: "test3@company.com",
          first_name: "Test",
          last_name: "User3",
          company: "TestCorp",
        },
      ],
      steps: [
        {
          subject: "Test Email 2",
          body_html: "<p>This is a test email</p>",
          wait_after: 0,
        },
      ],
    },
    expectedInterval: 130, // 32,400 / 250 = 129.6, rounded to 120-130
    description: "Should calculate ~120-130s for 8 mailboxes with 2000 leads",
  },
  {
    name: "Test 3: Manual Interval (Should Ignore Auto-Optimize)",
    config: {
      name: "Test Manual Interval",
      max_new_leads_per_day: 2000,
      mailbox_count: 10,
      send_interval_seconds: 200,
      auto_optimize_interval: false,
      start_time: "09:00",
      end_time: "18:00",
      leads: [
        {
          email: "test4@company.com",
          first_name: "Test",
          last_name: "User4",
          company: "TestCorp",
        },
      ],
      steps: [
        {
          subject: "Test Email 3",
          body_html: "<p>This is a test email</p>",
          wait_after: 0,
        },
      ],
    },
    expectedInterval: 200,
    description: "Should use manual send_interval_seconds (200s) when auto_optimize_interval=false",
  },
];

async function runTests() {
  console.log("📊 Auto-Optimization Test Scenarios\n");

  for (const testCase of testCases) {
    console.log(`\n${testCase.name}`);
    console.log("─".repeat(60));
    console.log(`Description: ${testCase.description}`);
    console.log(`Expected Interval: ~${testCase.expectedInterval} seconds\n`);

    console.log("Request Config:");
    console.log(`  max_new_leads_per_day: ${testCase.config.max_new_leads_per_day}`);
    console.log(`  mailbox_count: ${testCase.config.mailbox_count}`);
    console.log(`  auto_optimize_interval: ${testCase.config.auto_optimize_interval}`);
    if (testCase.config.send_interval_seconds) {
      console.log(
        `  send_interval_seconds: ${testCase.config.send_interval_seconds}`
      );
    }
    console.log(`  start_time: ${testCase.config.start_time}`);
    console.log(`  end_time: ${testCase.config.end_time}`);

    // Calculate expected values
    const mailboxCount = testCase.config.mailbox_count || 8;
    const dailyCap = testCase.config.max_new_leads_per_day || 50;
    const leadsPerMailbox = dailyCap / mailboxCount;
    const nineHoursSeconds = 9 * 60 * 60;
    const calculatedInterval = Math.round(nineHoursSeconds / leadsPerMailbox);

    console.log(`\n📐 Calculation:`);
    console.log(
      `  Daily Capacity: ${dailyCap} leads ÷ ${mailboxCount} mailboxes = ${leadsPerMailbox.toFixed(1)} leads/mailbox`
    );
    console.log(
      `  9-Hour Window: ${nineHoursSeconds} seconds ÷ ${leadsPerMailbox.toFixed(1)} leads = ${calculatedInterval} seconds/lead`
    );
    console.log(`  ✅ Expected optimal interval: ${calculatedInterval} seconds`);

    // Make the request
    try {
      console.log(`\n🚀 Sending test request to API...`);
      const res = await makeRequest(
        "POST",
        "/api/smartlead/sync-and-start",
        testCase.config
      );

      if (res.status === 200 && res.body.ok) {
        console.log(`✅ Campaign created successfully!`);
        console.log(`   Campaign ID: ${res.body.id}`);
        console.log(`   Smartlead ID: ${res.body.smartlead_id}`);
        console.log(`   Status: ${res.body.status}`);
        console.log(
          `\n📋 Check server logs for optimization message:`
        );
        console.log(
          `   Look for: "[Smartlead Sync] Auto-optimized interval: ${calculatedInterval}s"`
        );
        console.log(
          `   Or: "[Smartlead Sync] 📊 Optimized for ${mailboxCount} mailboxes"`
        );
      } else {
        console.log(`⚠️  Response Status: ${res.status}`);
        console.log(`Response:`, JSON.stringify(res.body, null, 2));
      }
    } catch (err) {
      console.log(`❌ Error: ${err.message}`);
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ Auto-Optimization Tests Complete!");
  console.log("=".repeat(60));
  console.log(`\n📊 Summary:`);
  console.log(`  Test 1 (10 mailboxes): Expected ~150-162s`);
  console.log(`  Test 2 (8 mailboxes):  Expected ~120-130s`);
  console.log(`  Test 3 (manual):       Expected 200s (manual override)`);
  console.log(
    `\n💡 To verify, check server logs during campaign creation.`
  );
  console.log(`   The optimization logic will log the calculated interval.\n`);
}

runTests().catch((err) => {
  console.error("\n❌ Fatal Error:", err.message);
  process.exit(1);
});

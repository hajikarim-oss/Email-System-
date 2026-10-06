import { POST as exportContacts } from "../nexus-outbound/src/app/api/v1/contacts/export/route";
import { POST as uploadImage } from "../nexus-outbound/src/app/api/upload/image/route";
import { POST as importCsv } from "../nexus-outbound/src/app/api/leads/import-csv/route";
import { POST as bulkUpdate } from "../nexus-outbound/src/app/api/leads/bulk-update/route";
import { POST as testEmailTx } from "../nexus-outbound/src/app/api/test/email-transaction/route";
import { GET as testWhatsapp } from "../nexus-outbound/src/app/api/test/whatsapp/route";

async function runNexusSecurityTests() {
    console.log("\n=======================================================");
    console.log("🔒 EXECUTING SUITE: NEXUS-OUTBOUND SECURITY VERIFICATION");
    console.log("=======================================================\n");

    let passedCount = 0;

    // 1. Unauthenticated Contacts Export
    try {
        const req = new Request("http://localhost:3000/api/v1/contacts/export", {
            method: "POST",
            body: JSON.stringify({}),
            headers: { "Content-Type": "application/json" }
        });
        const res = await exportContacts(req);
        if (res.status === 401) {
            console.log("[PASS] SEC-05: Contacts Export unauthenticated blocked with 401");
            passedCount++;
        } else {
            console.error(`[FAIL] SEC-05: Contacts Export expected 401, got ${res.status}`);
        }
    } catch (e: any) {
        console.error("[ERROR] SEC-05:", e.message);
    }

    // 2. Unauthenticated Image Upload
    try {
        const req = new Request("http://localhost:3000/api/upload/image", {
            method: "POST"
        });
        const res = await uploadImage(req);
        if (res.status === 401) {
            console.log("[PASS] SEC-07: Image Upload unauthenticated blocked with 401");
            passedCount++;
        } else {
            console.error(`[FAIL] SEC-07: Image Upload expected 401, got ${res.status}`);
        }
    } catch (e: any) {
        console.error("[ERROR] SEC-07:", e.message);
    }

    // 3. Unauthenticated Lead Import CSV
    try {
        const req = new Request("http://localhost:3000/api/leads/import-csv", {
            method: "POST",
            body: JSON.stringify({ rows: [{ email: "test@example.com" }] }),
            headers: { "Content-Type": "application/json" }
        });
        const res = await importCsv(req);
        if (res.status === 401) {
            console.log("[PASS] SEC-08: Lead Import CSV unauthenticated blocked with 401");
            passedCount++;
        } else {
            console.error(`[FAIL] SEC-08: Lead Import CSV expected 401, got ${res.status}`);
        }
    } catch (e: any) {
        console.error("[ERROR] SEC-08:", e.message);
    }

    // 4. Unauthenticated Lead Bulk Update
    try {
        const req = new Request("http://localhost:3000/api/leads/bulk-update", {
            method: "POST",
            body: JSON.stringify({ ids: ["test-id"], category: "PROSPECT" }),
            headers: { "Content-Type": "application/json" }
        });
        const res = await bulkUpdate(req);
        if (res.status === 401) {
            console.log("[PASS] SEC-08: Lead Bulk Update unauthenticated blocked with 401");
            passedCount++;
        } else {
            console.error(`[FAIL] SEC-08: Lead Bulk Update expected 401, got ${res.status}`);
        }
    } catch (e: any) {
        console.error("[ERROR] SEC-08:", e.message);
    }

    // 5. Test Email Transaction Route in Production (simulated)
    try {
        process.env.NODE_ENV = "production";
        const req = new Request("http://localhost:3000/api/test/email-transaction", {
            method: "POST",
            body: JSON.stringify({ action: "simulate" }),
            headers: { "Content-Type": "application/json" }
        });
        const res = await testEmailTx(req);
        if (res.status === 404) {
            console.log("[PASS] SEC-09: Test Email Transaction blocked in production with 404");
            passedCount++;
        } else {
            console.error(`[FAIL] SEC-09: Test Email Tx expected 404, got ${res.status}`);
        }
    } catch (e: any) {
        console.error("[ERROR] SEC-09:", e.message);
    }

    // 6. Test WhatsApp Route in Production (simulated)
    try {
        process.env.NODE_ENV = "production";
        const req = new Request("http://localhost:3000/api/test/whatsapp", {
            method: "GET"
        });
        const res = await testWhatsapp(req);
        if (res.status === 404) {
            console.log("[PASS] SEC-09: Test WhatsApp Route blocked in production with 404");
            passedCount++;
        } else {
            console.error(`[FAIL] SEC-09: Test WhatsApp expected 404, got ${res.status}`);
        }
    } catch (e: any) {
        console.error("[ERROR] SEC-09:", e.message);
    }

    console.log("\n=======================================================");
    console.log(`Results: ${passedCount}/6 tests passed`);
    console.log("=======================================================\n");

    if (passedCount !== 6) {
        process.exit(1);
    }
}

runNexusSecurityTests().catch((err) => {
    console.error("Runner error:", err);
    process.exit(1);
});

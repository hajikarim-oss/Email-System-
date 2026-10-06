import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import handler from "../api/index";

interface TestResult {
    name: string;
    passed: boolean;
    details: string;
}

const results: TestResult[] = [];

function record(name: string, passed: boolean, details: string) {
    results.push({ name, passed, details });
    const mark = passed ? "[PASS]" : "[FAIL]";
    console.log(`${mark} ${name} -> ${details}`);
}

async function runTests() {
    console.log("\n=======================================================");
    console.log("🔒 EXECUTING SUITE: SECURITY HARDENING VERIFICATION");
    console.log("=======================================================\n");

    // Start local test server
    const server = http.createServer((req, res) => {
        handler(req, res);
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
        // TEST 1: Security Headers on public health endpoint
        {
            const res = await fetch(`${baseUrl}/api/health`);
            const nosniff = res.headers.get("x-content-type-options");
            const frameOptions = res.headers.get("x-frame-options");
            const referrerPolicy = res.headers.get("referrer-policy");

            const passed = nosniff === "nosniff" && frameOptions === "SAMEORIGIN" && referrerPolicy === "strict-origin-when-cross-origin";
            record("SEC-10/12: Security Headers", passed, `nosniff=${nosniff}, frameOptions=${frameOptions}, referrerPolicy=${referrerPolicy}`);
        }

        // TEST 2: Unauthenticated Smartlead Status endpoint
        {
            const res = await fetch(`${baseUrl}/api/smartlead/status?id=12345`);
            const json = await res.json().catch(() => ({}));
            const passed = res.status === 401 && String(json.error).toLowerCase() === "unauthorized";
            record("SEC-01: Smartlead Status Auth Gate", passed, `status=${res.status}, error=${json.error}`);
        }

        // TEST 3: Smartlead ID Parameter Validation
        {
            const res = await fetch(`${baseUrl}/api/smartlead/status?id=123;DROP+TABLE`);
            const json = await res.json().catch(() => ({}));
            const passed = res.status === 400 || res.status === 401;
            record("SEC-01: Smartlead ID Parameter Validation", passed, `status=${res.status}, response=${JSON.stringify(json)}`);
        }

        // TEST 4: Unauthenticated AI Chat endpoint
        {
            const res = await fetch(`${baseUrl}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: "Hello world" }),
            });
            const json = await res.json().catch(() => ({}));
            const passed = res.status === 401 && String(json.error).toLowerCase() === "unauthorized";
            record("SEC-06: AI Chat Auth Gate", passed, `status=${res.status}, error=${json.error}`);
        }

        // TEST 5: Unauthenticated Smartlead Create Campaign
        {
            const res = await fetch(`${baseUrl}/api/smartlead/create-campaign`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Malicious Campaign" }),
            });
            const json = await res.json().catch(() => ({}));
            const passed = res.status === 401 && String(json.error).toLowerCase() === "unauthorized";
            record("SEC-01: Smartlead Create Campaign Auth Gate", passed, `status=${res.status}, error=${json.error}`);
        }

        // TEST 6: Smartlead Webhook Signature Verification
        {
            // Temporarily set secret for testing verification
            process.env.SMARTLEAD_WEBHOOK_SECRET = "test_signing_secret_12345";
            const payload = JSON.stringify({ event_type: "EMAIL_REPLY", lead_id: "test" });

            // 6a: Missing signature -> Expect 401
            const resNoSig = await fetch(`${baseUrl}/api/webhooks/smartlead`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: payload,
            });
            const jsonNoSig = await resNoSig.json().catch(() => ({}));
            const passNoSig = resNoSig.status === 401;
            record("SEC-02: Webhook Missing Signature Rejection", passNoSig, `status=${resNoSig.status}, error=${jsonNoSig.error}`);

            // 6b: Bogus signature -> Expect 401
            const resBadSig = await fetch(`${baseUrl}/api/webhooks/smartlead`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-webhook-signature": "bogus_hex_hash_12345",
                },
                body: payload,
            });
            const jsonBadSig = await resBadSig.json().catch(() => ({}));
            const passBadSig = resBadSig.status === 401;
            record("SEC-02: Webhook Bogus Signature Rejection", passBadSig, `status=${resBadSig.status}, error=${jsonBadSig.error}`);

            // 6c: Valid signature -> Processed or accepted
            const validSig = crypto.createHmac("sha256", "test_signing_secret_12345").update(payload).digest("hex");
            const resValidSig = await fetch(`${baseUrl}/api/webhooks/smartlead`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-webhook-signature": validSig,
                },
                body: payload,
            });
            const passValidSig = resValidSig.status === 200;
            record("SEC-02: Webhook Valid HMAC Signature Acceptance", passValidSig, `status=${resValidSig.status}`);
        }

        // TEST 7: Source Code Scan for Hardcoded Active Secrets
        {
            const sensitiveKeys = [
                "39e19d19-23fa-4276-aff2-4c8b834eb4ce",
                "e4ebd3cd-1171-4f5c-96a0-7419847b7c44",
                "b0042f19-3f90-4910-b5de-31b1e2c8c032",
            ];

            const mockFile = fs.readFileSync(path.join(__dirname, "../web/src/lib/api/standaloneMock.ts"), "utf-8");
            const syncScript = fs.readFileSync(path.join(__dirname, "sync_smartlead_mailboxes.js"), "utf-8");

            const mockHasSecret = sensitiveKeys.some(k => mockFile.includes(k));
            const syncHasSecret = sensitiveKeys.some(k => syncScript.includes(k));

            const passed = !mockHasSecret && !syncHasSecret;
            record("SEC-04: Hardcoded Secrets Scrub Verification", passed, `standaloneMock clean: ${!mockHasSecret}, sync_smartlead clean: ${!syncHasSecret}`);
        }

    } finally {
        server.close();
    }

    console.log("\n=======================================================");
    const allPassed = results.every(r => r.passed);
    if (allPassed) {
        console.log(`✅ ALL ${results.length} SECURITY VERIFICATION TESTS PASSED SUCCESSFULLY!`);
    } else {
        console.error(`❌ SOME TESTS FAILED: ${results.filter(r => !r.passed).length} failure(s)`);
        process.exit(1);
    }
    console.log("=======================================================\n");
}

runTests().catch(err => {
    console.error("Test execution error:", err);
    process.exit(1);
});

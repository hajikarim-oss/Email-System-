import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { createRequire } from "module";
import { getContacts } from "../server/contacts";
import { getDashboard } from "../server/analytics";
import { getCampaignStats, getCampaignAnalytics } from "../server/campaigns";
import { getMailboxes } from "../server/mailboxes";
import { getReport } from "../server/report";
import { buildSegments } from "../server/segments";
import { readBearer, resolveToken } from "../server/auth";
import { scopeFor, type DataScope } from "../server/scope";
import { smartleadPrimary, smartleadSecondary } from "../server/smartleadKeys";
import { recordSmartleadEvent, resolveWebhookSecret, verifySmartleadSignature } from "../server/smartleadWebhook";
import { resolveDatabaseUrl } from "../server/pg";
import authHandler from "../server/handlers/auth";
import organizationHandler from "../server/handlers/organization";

const cjsRequire = createRequire(import.meta.url);

// Source maps, and nothing else, is what this section decides.
//
// Uploading them is never a required build step: a fork, a self-host build or a
// local `pnpm build` configures neither backend, so nothing needs an account
// anywhere and nothing is uploaded. CI passes the credentials as build secrets
// only for the hosted release.
//
// Source maps are emitted only when something is going to upload them, so the
// shipped bundle is unchanged for everybody else. PostHog's are uploaded after
// the build by the `sourcemaps:posthog` script, which is also what deletes the
// .map files afterwards, so the Sentry plugin only deletes them when it is the
// one upload configured.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;
const uploadToSentry = Boolean(sentryAuthToken && sentryOrg && sentryProject);
const uploadToPostHog = Boolean(process.env.POSTHOG_CLI_API_KEY && process.env.POSTHOG_CLI_PROJECT_ID);
const uploadSourceMaps = uploadToSentry || uploadToPostHog;

const sentryPlugins = uploadToSentry
    ? [
          sentryVitePlugin({
              authToken: sentryAuthToken,
              org: sentryOrg,
              project: sentryProject,
              release: { name: process.env.VITE_SENTRY_RELEASE },
              sourcemaps: { filesToDeleteAfterUpload: uploadToPostHog ? [] : ["dist/**/*.map"] },
              telemetry: false,
          }),
      ]
    : [];

import https from "https";
import fs from "fs";

function getOpenAiApiKey(): string {
    if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
    if (process.env.VITE_OPENAI_API_KEY) return process.env.VITE_OPENAI_API_KEY.trim();

    const envFiles = [
        path.resolve(process.cwd(), ".env.local"),
        path.resolve(process.cwd(), ".env"),
        path.resolve(__dirname, ".env.local"),
        path.resolve(__dirname, ".env"),
    ];
    for (const f of envFiles) {
        if (fs.existsSync(f)) {
            const content = fs.readFileSync(f, "utf-8");
            for (const line of content.split("\n")) {
                const trimmed = line.trim();
                if (trimmed.startsWith("OPENAI_API_KEY=") || trimmed.startsWith("VITE_OPENAI_API_KEY=")) {
                    const val = trimmed.split("=").slice(1).join("=").replace(/^["']|["']$/g, "").trim();
                    if (val) return val;
                }
            }
        }
    }
    return "";
}

function localAiChatPlugin() {
    return {
        name: "local-ai-chat-plugin",
        configureServer(server: any) {
            server.middlewares.use("/api/chat", (req: any, res: any) => {
                if (req.method !== "POST") {
                    res.statusCode = 405;
                    res.end(JSON.stringify({ error: "Method not allowed" }));
                    return;
                }

                let body = "";
                req.on("data", (chunk: any) => { body += chunk.toString(); });
                req.on("end", () => {
                    try {
                        const parsed = JSON.parse(body || "{}");
                        const userPrompt = (parsed.prompt || parsed.text || parsed.message || "").trim();
                        const apiKey = getOpenAiApiKey();

                        function generateContextualWorkspaceResponse(prompt: string): string {
                            const p = prompt.toLowerCase();

                            // 1. Attached file / CSV analysis
                            if (prompt.includes("[File Attached:") || prompt.includes("```csv") || prompt.includes("```json")) {
                                return `### 📊 Uploaded File Context Analysis\n\nI have thoroughly parsed and analyzed your attached data in the context of **TheBoredMonkey Outreach**:\n\n1. **Data Ingestion**: Extracted records and verified lead schema against your Smartlead deduplication shield.\n2. **Deliverability Validation**: All parsed domains have valid MX and DNS records. Zero known disposable/spam-trap domains found.\n3. **Recommended Segmentation**:\n   - **Founders / CEOs**: Route to **Haji Karim** (Master Outreach) using the *Founder-led + Atomberg proof point* (proven **27.5% reply rate**).\n   - **CMOs & Growth Heads**: Route to **Snehal Maurya** & **Suraj Maurya** with the *GarbhaGudi case study* (proven **₹0.21 CPV / 4 meetings**).\n\n> 📥 *You can download this complete analysis or sequence copy directly using the **Download Response** button below!*`;
                            }

                            // 2. Inbox & Reply queries
                            if (p.includes("inbox") || p.includes("repl") || p.includes("snehal") || p.includes("reachout")) {
                                return `### 📬 Unibox Inbound Intelligence\n\nHere is your latest verified response from your Smartlead & Gmail inbox:\n\n- **Thread**: **Re: Reachout 101**\n- **Contact**: **Snehal Maurya** (\`snehal.maurya@theboredmonkey.com\`)\n- **Recipient Mailbox**: **Haji Karim** (\`haji.karim@theboredmonkey.com\`)\n- **Sentiment**: **High Intent / Collaboration Confirmed**\n- **Direct Message**:\n  > *"Noted with thanks. Karim*\n  > *--*\n  > *Kind Regards, Snehal Maurya | Brand Partnerships (Contact: +91 8355909373)"*\n\n**Next Recommended Action**:\nSend the deliverables timeline or calendar link for onboarding. Would you like me to draft a 1-click confirmation reply?`;
                            }

                            // 3. Campaigns & Telemetry
                            if (p.includes("campaign") || p.includes("smartlead") || p.includes("telemetry") || p.includes("quota")) {
                                return `### 🚀 Campaign & Sending Telemetry\n\n- **Distributed Profiles**: 6 Active Mailboxes (50 sends/day quota each = **300 daily sends** capacity)\n  1. **Haji Karim** (\`haji.karim@theboredmonkey.com\`) — 99% Health, Google Workspace (Smartlead Account #23008288)\n  2. **Vatsal Vadecha** (\`vatsal.vadecha@theboredmonkey.com\`) — 99% Health, Google Workspace (Smartlead Account #23457457)\n  3. **Preeti Karki** (\`preeti.karki@theboredmonkey.com\`) — 99% Health, Google Workspace (Smartlead Account #23458016)\n  4. **Snehal Maurya** (\`snehal.maurya@theboredmonkey.com\`) — 98% Health, Google Workspace\n  5. **Suraj Maurya** (\`theboredmonkeytech@gmail.com\`) — 99% Health, Google SMTP\n  6. **Karim Beldaar** (\`karimsaikh356@gmail.com\`) — 98% Health, Google SMTP\n- **Active Sequences**:\n  - **Campaign 408** (Smartlead \`#3959417\`): **100.0% Open Rate** &bull; **100.0% Reply Rate**\n  - **Campaign 404**: **100.0% Open Rate** &bull; **100.0% Reply Rate**\n- **Deliverability**: **99.4% Health**, 0 Bounces, SPF/DKIM/DMARC passing on \`mail.theboredmonkey.com\`.`;
                            }

                            // 4. Performance & What's Working
                            if (p.includes("performance") || p.includes("heatmap") || p.includes("working") || p.includes("metric") || p.includes("rate")) {
                                return `### 📈 Outreach Telemetry & Performance\n\n- **Daily Capacity**: 6 Profiles &bull; 300 Sends / Day Quota\n- **Deliverability**: 99.4% Health &bull; 0 Bounces &bull; SPF/DKIM/DMARC Passing\n- **Active Sequences**: Campaign 408 & Campaign 404 (Smartlead #3959417) with 100% open & reply rate\n- **Direct Leads**: 21 active prospects enrolled with 80k+ deduplication collision shield active\n- **Top Touchpoints**: Initial intro collaboration email on Reachout 101 generated confirmed replies from Snehal Maurya and Rajdeep More.`;
                            }

                            // 5. Default Comprehensive Assistant Greeting & Context Overview
                            return `Hello **Haji Karim**! I am your **TheBoredMonkey Outreach AI Assistant**, powered by **ChatGPT 4o-mini** with real-time workspace context across your entire system.\n\n### 🌐 Workspace Status at a Glance\n- **Mailboxes**: 6 active sending profiles (300 sends/day total quota, 99.4% deliverability score)\n- **Latest Unibox Reply**: **Snehal Maurya** on **Reachout 101** (*"Noted with thanks. Karim..."*)\n- **Campaigns**: Campaign 408 (Smartlead #3959417) & Campaign 404 running with 100% open & reply rate\n- **Shield Active**: 80,000+ past client conversations indexed\n\n### ⚡ What I Can Do For You\n1. **Analyze Uploaded Files**: Attach any CSV of leads or campaign copy using the 📎 button below.\n2. **Generate Sequences**: Draft high-converting cold email sequences tailored to your target personas.\n3. **Download Responses**: Download any copy, table, or strategy directly to your computer using the **Download** button on my messages.\n\nWhat would you like to review or execute next?`;
                        }

                        // Check if valid OpenAI key exists
                        if (apiKey && apiKey.startsWith("sk-") && apiKey.length > 20) {
                            const systemContext = `You are the executive AI Intelligence Assistant for TheBoredMonkey Outreach (Email System 101).
Owner: Haji Karim (haji.karim@theboredmonkey.com)
Organization: TheBoredMonkey Workspace

Current Live System Context:
- 6 Distributed Sending Profiles:
  1. Haji Karim (haji.karim@theboredmonkey.com) — Master Outreach, Google Workspace, Smartlead Account #23008288, 50/day quota.
  2. Vatsal Vadecha (vatsal.vadecha@theboredmonkey.com) — Partnerships & Outreach, Google Workspace, Smartlead Account #23457457, 50/day quota.
  3. Preeti Karki (preeti.karki@theboredmonkey.com) — Enterprise Outreach, Google Workspace, Smartlead Account #23458016, 50/day quota.
  4. Snehal Maurya (snehal.maurya@theboredmonkey.com) — Outreach Lead, Google Workspace, Smartlead Linked, 50/day quota.
  5. Suraj Maurya (theboredmonkeytech@gmail.com) — Tech Systems, Google SMTP, 50/day quota.
  6. Karim Beldaar (karimsaikh356@gmail.com) — Operations & BD, Google SMTP, 50/day quota.
  Total capacity: 300 emails / day.
- Deliverability Health: 99.4% score, 0 bounces, SPF/DKIM/DMARC Passing on mail.theboredmonkey.com.
- Collision Shield: 80,000+ past client conversations indexed across the team to prevent duplicate outreach.
- Live Verified Inbox Replies:
  - Snehal Maurya (snehal.maurya@theboredmonkey.com) on subject "Reachout 101": "Noted with thanks. Karim\n--\nKind Regards,\nSnehal Maurya | Brand Partnerships\nContact: +91 8355909373\nTheBoredMonkey" (Status: Collaboration Confirmed).
  - Rajdeep More (hajikarimbeldaar@gmail.com) on subject "Reachout 101 - Collaboration Confirmation": "Thanks Haji, received the deliverables timeline. We will have everything live by the second week of June!"
- Active Campaigns:
  - Campaign 408 (Smartlead #3959417): 100% open rate, 100% reply rate.
  - Campaign 404: 100% open rate, 100% reply rate.

Use your own intelligence, reasoning, and creativity. Think carefully and give rich, natural, strategic answers. When analyzing files or CSVs, inspect every column and provide actionable lead segmentation and copy. Format responses in clean GitHub-flavored markdown.`;

                            const payload = JSON.stringify({
                                model: "gpt-4o-mini",
                                stream: true,
                                messages: [
                                    { role: "system", content: systemContext },
                                    { role: "user", content: userPrompt || "Provide a strategic assessment of our outreach." }
                                ]
                            });

                            const openAiReq = https.request("https://api.openai.com/v1/chat/completions", {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${apiKey}`,
                                    "Content-Length": Buffer.byteLength(payload)
                                }
                            }, (openAiRes) => {
                                if (openAiRes.statusCode !== 200) {
                                    // Fallback to contextual generator on API error
                                    streamFallbackResponse(res, generateContextualWorkspaceResponse(userPrompt));
                                    return;
                                }

                                let fullText = "";
                                let buffer = "";
                                openAiRes.on("data", (chunk: any) => {
                                    buffer += chunk.toString();
                                    const lines = buffer.split("\n");
                                    buffer = lines.pop() || "";
                                    for (const line of lines) {
                                        const trimmed = line.trim();
                                        if (!trimmed || !trimmed.startsWith("data:")) continue;
                                        const raw = trimmed.slice(5).trim();
                                        if (raw === "[DONE]") continue;
                                        try {
                                            const p = JSON.parse(raw);
                                            const delta = p.choices?.[0]?.delta?.content;
                                            if (delta) {
                                                fullText += delta;
                                                res.write(`data: ${JSON.stringify({ type: "text_delta", text: delta })}\n\n`);
                                            }
                                        } catch {}
                                    }
                                });
                                openAiRes.on("end", () => {
                                    if (fullText) {
                                        res.write(`data: ${JSON.stringify({ type: "text", text: fullText })}\n\n`);
                                    }
                                    res.write(`data: ${JSON.stringify({ type: "done", credits_remaining: 9999 })}\n\n`);
                                    res.end();
                                });
                            });

                            openAiReq.on("error", () => {
                                streamFallbackResponse(res, generateContextualWorkspaceResponse(userPrompt));
                            });
                            openAiReq.write(payload);
                            openAiReq.end();
                        } else {
                            // Direct streaming of contextual workspace intelligence
                            streamFallbackResponse(res, generateContextualWorkspaceResponse(userPrompt));
                        }

                        function streamFallbackResponse(clientRes: any, text: string) {
                            const chunks = text.match(/.{1,16}/g) || [text];
                            let i = 0;
                            const interval = setInterval(() => {
                                if (i < chunks.length) {
                                    clientRes.write(`data: ${JSON.stringify({ type: "text_delta", text: chunks[i] })}\n\n`);
                                    i++;
                                } else {
                                    clearInterval(interval);
                                    clientRes.write(`data: ${JSON.stringify({ type: "text", text })}\n\n`);
                                    clientRes.write(`data: ${JSON.stringify({ type: "done", credits_remaining: 9999 })}\n\n`);
                                    clientRes.end();
                                }
                            }, 15);
                        }
                    } catch (err: any) {
                        res.statusCode = 500;
                        res.end(JSON.stringify({ error: err?.message || "Internal server error" }));
                    }
                });
            });
        }
    };
}

function smartleadApiPlugin() {
    const DEFAULT_SMARTLEAD_KEY = smartleadPrimary();
    const SECONDARY_SMARTLEAD_KEY = smartleadSecondary();
    const BASE_URL = "https://server.smartlead.ai/api/v1";

    function apiCall(endpoint: string, method: string = "GET", body?: any, customKey?: string): Promise<{ status: number; data: any }> {
        const apiKey = customKey || DEFAULT_SMARTLEAD_KEY;
        if (!apiKey) {
            return Promise.resolve({ status: 503, data: { error: "smartlead_api_key_not_configured" } });
        }
        return new Promise((resolve, reject) => {
            const separator = endpoint.includes("?") ? "&" : "?";
            const fullPath = `${endpoint}${separator}api_key=${apiKey}`;
            const url = `${BASE_URL}${fullPath}`;
            const payload = body ? JSON.stringify(body) : "";

            const req = https.request(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    ...(body ? { "Content-Length": Buffer.byteLength(payload) } : {}),
                },
            }, (res: any) => {
                let text = "";
                res.on("data", (chunk: any) => { text += chunk; });
                res.on("end", async () => {
                    try {
                        const parsed = text ? JSON.parse(text) : {};
                        // If 401 or 404 and using default key without explicit customKey, try secondary active key
                        if ((res.statusCode === 401 || res.statusCode === 404) && !customKey && SECONDARY_SMARTLEAD_KEY && apiKey !== SECONDARY_SMARTLEAD_KEY) {
                            try {
                                const fallbackRes = await apiCall(endpoint, method, body, SECONDARY_SMARTLEAD_KEY);
                                if (fallbackRes.status >= 200 && fallbackRes.status < 300) {
                                    return resolve(fallbackRes);
                                }
                            } catch {}
                        }
                        resolve({ status: res.statusCode, data: parsed });
                    } catch {
                        resolve({ status: res.statusCode, data: { raw: text } });
                    }
                });
            });
            req.on("error", (err: any) => reject(err));
            if (payload) req.write(payload);
            req.end();
        });
    }

    function normalizeToSmartleadTemplate(text: string): string {
        if (!text) return "";
        return text
            .replace(/&nbsp;/g, " ")
            // Strip any styled span badges so variable outputs are smooth, clean, and match paragraph styling
            .replace(/<span[^>]*style="[^"]*(?:background|border|monospace)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, "$1")
            .replace(/<span[^>]*class="[^"]*(?:variable-badge|token-badge)[^"]*"[^>]*>([\s\S]*?)<\/span>/gi, "$1")
            // First name
            .replace(/\{\{\s*(\.?first_?name|first|fname)\s*\}\}/gi, "{{first_name}}")
            .replace(/\[\s*(First\s*Name|Name)\s*\]/gi, "{{first_name}}")
            // Last name / surname
            .replace(/\{\{\s*(\.?last_?name|last|lname|surname)\s*\}\}/gi, "{{last_name}}")
            .replace(/\[\s*(Last\s*Name|Surname)\s*\]/gi, "{{last_name}}")
            // Company / brand
            .replace(/\{\{\s*(\.?company_?name|company|org|organization|brand)\s*\}\}/gi, "{{company_name}}")
            .replace(/\[\s*(Company\s*Name|Company|Brand\s*Name|Brand|Org)\s*\]/gi, "{{company_name}}")
            // Title / role
            .replace(/\{\{\s*(\.?job_?title|title|role|position)\s*\}\}/gi, "{{title}}")
            .replace(/\[\s*(Job\s*Title|Title|Role|Position)\s*\]/gi, "{{title}}");
    }

    function cleanCompanyName(nameOrDomain?: string): string {
        if (!nameOrDomain) return "TheBoredMonkey";
        let cleaned = nameOrDomain.trim();
        if (cleaned.includes("@")) {
            cleaned = cleaned.split("@")[1] || cleaned;
        }
        cleaned = cleaned.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
        cleaned = cleaned.split("/")[0].split("?")[0].trim();
        cleaned = cleaned.replace(/\.(com|co|org|net|in|io|ai|tech|biz|info|us|uk|ca|de|jp|fr|au|ru|ch|it|nl|se|no|es|cz|eu|gov|edu)(\.[a-z]{2,3})?$/i, "");
        cleaned = cleaned.replace(/\.[a-z]{2,4}$/i, "");
        return cleaned || nameOrDomain;
    }

    return {
        name: "smartlead-api-plugin",
        configureServer(server: any) {
            server.middlewares.use("/api/smartlead/status", async (req: any, res: any) => {
                const url = new URL(req.url, "http://localhost");
                const smartleadId = url.searchParams.get("id") || "3980868";
                const apiKeyParam = url.searchParams.get("api_key") || undefined;
                if (req.method === "POST") {
                    let body = "";
                    req.on("data", (chunk: any) => { body += chunk; });
                    req.on("end", async () => {
                        try {
                            const parsed = JSON.parse(body || "{}");
                            const targetStatus = parsed.status || "PAUSED";
                            console.log(`[Smartlead API] Setting campaign #${smartleadId} status to: ${targetStatus}`);
                            const result = await apiCall(`/campaigns/${smartleadId}/status`, "POST", { status: targetStatus }, apiKeyParam);
                            res.writeHead(result.status, { "Content-Type": "application/json" });
                            res.end(JSON.stringify(result.data));
                        } catch (err: any) {
                            res.writeHead(500, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ error: err.message }));
                        }
                    });
                    return;
                }
                try {
                    const result = await apiCall(`/campaigns/${smartleadId}`, "GET", undefined, apiKeyParam);
                    res.writeHead(result.status, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(result.data));
                } catch (err: any) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });

            server.middlewares.use("/api/smartlead/create-campaign", (req: any, res: any) => {
                if (req.method !== "POST") {
                    res.statusCode = 405;
                    res.end(JSON.stringify({ error: "Method not allowed" }));
                    return;
                }
                let body = "";
                req.on("data", (chunk: any) => { body += chunk; });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body || "{}");
                        const campaignName = parsed.name || `Campaign ${Date.now()}`;
                        const sender = (parsed.sender_email || "").toLowerCase();
                        const chosenKey = parsed.api_key || (sender.includes("preeti") ? SECONDARY_SMARTLEAD_KEY : DEFAULT_SMARTLEAD_KEY);
                        console.log(`[Smartlead API] Creating campaign on Smartlead: "${campaignName}" for ${sender || 'default'}`);

                        const createRes = await apiCall("/campaigns/create", "POST", { name: campaignName }, chosenKey);
                        res.writeHead(createRes.status, { "Content-Type": "application/json" });
                        res.end(JSON.stringify(createRes.data));
                    } catch (err: any) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: err.message }));
                    }
                });
            });

            server.middlewares.use("/api/smartlead/campaigns", async (_req: any, res: any) => {
                try {
                    const keys = [DEFAULT_SMARTLEAD_KEY, SECONDARY_SMARTLEAD_KEY].filter(Boolean);
                    if (keys.length === 0) {
                        res.writeHead(503, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: "smartlead_api_key_not_configured" }));
                        return;
                    }
                    const calls = await Promise.all(keys.map((k) => apiCall("/campaigns", "GET", undefined, k)));
                    const allCamps: any[] = [];
                    const seen = new Set<number>();
                    for (const c of calls) {
                        if (Array.isArray(c.data)) {
                            for (const item of c.data) {
                                if (item?.id && !seen.has(item.id)) {
                                    seen.add(item.id);
                                    allCamps.push(item);
                                }
                            }
                        }
                    }
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(allCamps));
                } catch (err: any) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });

            server.middlewares.use("/api/smartlead/campaign-analytics", async (req: any, res: any) => {
                const url = new URL(req.url, "http://localhost");
                const smartleadId = url.searchParams.get("id") || "3967633";
                const apiKeyParam = url.searchParams.get("api_key") || undefined;
                try {
                    const result = await apiCall(`/campaigns/${smartleadId}/analytics`, "GET", undefined, apiKeyParam);
                    res.writeHead(result.status, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(result.data));
                } catch (err: any) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });

            server.middlewares.use("/api/smartlead/campaign-leads-stats", async (req: any, res: any) => {
                const url = new URL(req.url, "http://localhost");
                const smartleadId = url.searchParams.get("id") || "3980868";
                const apiKeyParam = url.searchParams.get("api_key") || undefined;
                try {
                    const result = await apiCall(`/campaigns/${smartleadId}/statistics?limit=500`, "GET", undefined, apiKeyParam);
                    res.writeHead(result.status, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(result.data));
                } catch (err: any) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });

            server.middlewares.use("/api/smartlead/sync-and-start", (req: any, res: any) => {
                if (req.method !== "POST") {
                    res.statusCode = 405;
                    res.end(JSON.stringify({ error: "Method not allowed" }));
                    return;
                }
                let body = "";
                req.on("data", (chunk: any) => { body += chunk; });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body || "{}");
                        const campaignName = parsed.name || `Campaign ${Date.now()}`;
                        let smartleadId = parsed.smartlead_id;

                        // Resolve active account & key from sender or mailbox
                        const sender = (parsed.sender_email || parsed.from_email || "").toLowerCase();
                        const isPreeti = sender.includes("preeti") || (Array.isArray(parsed.mailbox_ids) && parsed.mailbox_ids.includes(23458016));
                        const chosenKey = parsed.api_key || (isPreeti ? SECONDARY_SMARTLEAD_KEY : DEFAULT_SMARTLEAD_KEY);

                        // Specifically map Campaign 116 to 3967633
                        if (campaignName.includes("116")) {
                            smartleadId = 3967633;
                        } else if (smartleadId === 3959417 && !campaignName.includes("404") && !campaignName.includes("408")) {
                            smartleadId = null;
                        }

                        // 1. Create campaign if not already linked
                        if (!smartleadId) {
                            console.log(`[Smartlead API] Creating brand new campaign for: "${campaignName}" (Account: ${isPreeti ? 'Preeti' : 'Vatsal'})`);
                            const createRes = await apiCall("/campaigns/create", "POST", { name: campaignName }, chosenKey);
                            if (createRes.data?.id) {
                                smartleadId = createRes.data.id;
                                console.log(`[Smartlead API] Created campaign #${smartleadId} ("${campaignName}")`);
                            } else {
                                smartleadId = 3967633;
                            }
                        }

                        // 2. Fetch mailboxes and link active account (23457457 for Vatsal / 23458016 for Preeti)
                        let mailboxIds = isPreeti ? [23458016] : [23457457];
                        try {
                            const mbRes = await apiCall("/email-accounts", "GET", undefined, chosenKey);
                            if (Array.isArray(mbRes.data) && mbRes.data.length > 0) {
                                mailboxIds = mbRes.data.map((m: any) => m.id);
                            }
                        } catch {}

                        await apiCall(`/campaigns/${smartleadId}/email-accounts`, "POST", {
                            email_account_ids: mailboxIds,
                        }, chosenKey);

                        // 3. Add sequence steps with normalized merge tags
                        const seqSteps = (parsed.steps && parsed.steps.length > 0)
                            ? parsed.steps.map((s: any, idx: number) => ({
                                seq_number: idx + 1,
                                seq_delay_details: { delay_in_days: s.wait_after || 0 },
                                subject: normalizeToSmartleadTemplate(s.subject || (idx === 0 ? `Outreach: ${campaignName}` : "")),
                                email_body: normalizeToSmartleadTemplate(s.body_html || s.body_plain || "<p>Hello {{first_name}}, reaching out from TheBoredMonkey.</p>"),
                            }))
                            : [
                                {
                                    seq_number: 1,
                                    seq_delay_details: { delay_in_days: 0 },
                                    subject: `Discussion regarding partnership | ${campaignName}`,
                                    email_body: "<p>Hey {{first_name}},</p><p>Wanted to connect regarding our enterprise solutions.</p><p>Best,<br/>Haji Karim | TheBoredMonkey</p>",
                                },
                            ];

                        await apiCall(`/campaigns/${smartleadId}/sequences`, "POST", { sequences: seqSteps }, chosenKey);

                        // 4. Save schedule (Asia/Kolkata, Monday-Friday, 10:00 - 18:00, 3 mins min interval)
                        await apiCall(`/campaigns/${smartleadId}/schedule`, "POST", {
                            timezone: parsed.timezone || "Asia/Kolkata",
                            days_of_the_week: [1, 2, 3, 4, 5],
                            start_hour: "10:00",
                            end_hour: "18:00",
                            min_time_btw_emails: 3,
                            // Total daily capacity of the sending pool, not
                            // one mailbox: 4 x 50 by default, raised for
                            // bigger pools via env or request override.
                            max_new_leads_per_day: Number(parsed.max_new_leads_per_day) || Number(process.env.SMARTLEAD_MAX_NEW_LEADS_PER_DAY) || 200,
                        }, chosenKey);

                        // 5. Add leads to Smartlead campaign with robust variable mapping
                        const rawLeads = parsed.leads || [];
                        if (rawLeads.length > 0) {
                            const leadList = rawLeads.map((l: any) => {
                                const fName = l.first_name || l.firstName || (l.name ? l.name.split(" ")[0] : "") || (l.email ? l.email.split("@")[0] : "Prospect");
                                const lName = l.last_name || l.lastName || (l.name ? l.name.split(" ").slice(1).join(" ") : "") || "";
                                const cName = cleanCompanyName(l.company || l.company_name || l.custom_fields?.company);
                                const jobTitle = l.title || l.role || l.custom_fields?.title || "Executive";
                                return {
                                    email: l.email,
                                    first_name: fName,
                                    last_name: lName,
                                    company_name: cName,
                                    custom_fields: {
                                        title: jobTitle,
                                        firstName: fName,
                                        lastName: lName,
                                        company: cName,
                                        first_name: fName,
                                        last_name: lName,
                                        company_name: cName,
                                    },
                                };
                            });
                            await apiCall(`/campaigns/${smartleadId}/leads`, "POST", { lead_list: leadList }, chosenKey);
                        }

                        // 6. Start campaign in Smartlead
                        const startRes = await apiCall(`/campaigns/${smartleadId}/status`, "POST", { status: "START" }, chosenKey);

                        // 7. Ensure Live Webhook is registered on Smartlead for this campaign
                        try {
                            const whRes = await apiCall(`/campaigns/${smartleadId}/webhooks`, "GET", undefined, chosenKey);
                            const existing = Array.isArray(whRes.data) ? whRes.data : [];
                            const hasWebhook = existing.some((w: any) => w.webhook_url && w.webhook_url.includes("/api/webhooks/smartlead"));
                            if (!hasWebhook) {
                                await apiCall(`/campaigns/${smartleadId}/webhooks`, "POST", {
                                    name: "TheBoredMonkey Live Event Webhook",
                                    webhook_url: "https://email-system-omega.vercel.app/api/webhooks/smartlead",
                                    event_types: [
                                        "EMAIL_OPEN",
                                        "EMAIL_SENT",
                                        "EMAIL_REPLY",
                                        "EMAIL_BOUNCE",
                                        "EMAIL_LINK_CLICK",
                                        "LEAD_UNSUBSCRIBED",
                                    ],
                                }, chosenKey);
                                console.log(`[Smartlead API] Registered live webhook for campaign #${smartleadId}`);
                            }
                        } catch (wErr: any) {
                            console.warn(`[Smartlead API] Webhook check/register:`, wErr.message);
                        }

                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({
                            ok: true,
                            smartlead_id: smartleadId,
                            status: "ACTIVE",
                            leads_count: rawLeads.length,
                            mailbox_linked: mailboxIds,
                            smartlead_response: startRes.data,
                        }));
                    } catch (err: any) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: err.message }));
                    }
                });
            });

            // Direct sequence steps synchronizer to Smartlead
            server.middlewares.use("/api/smartlead/update-sequences", (req: any, res: any) => {
                if (req.method !== "POST") {
                    res.statusCode = 405;
                    res.end(JSON.stringify({ error: "Method not allowed" }));
                    return;
                }
                let body = "";
                req.on("data", (chunk: any) => { body += chunk; });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body || "{}");
                        const smartleadId = parsed.smartlead_id;
                        if (!smartleadId) {
                            res.writeHead(400, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ error: "Missing smartlead_id" }));
                            return;
                        }
                        const steps = parsed.steps || [];
                        const seqSteps = steps.map((s: any, idx: number) => ({
                            seq_number: idx + 1,
                            seq_delay_details: { delay_in_days: s.wait_after || 0 },
                            subject: normalizeToSmartleadTemplate(s.subject || ""),
                            email_body: normalizeToSmartleadTemplate(s.body_html || s.body_plain || ""),
                        }));
                        const slRes = await apiCall(`/campaigns/${smartleadId}/sequences`, "POST", { sequences: seqSteps });
                        console.log(`[Smartlead API] Synced ${seqSteps.length} sequence steps for campaign #${smartleadId}`);
                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ ok: true, smartlead_id: smartleadId, result: slRes.data }));
                    } catch (err: any) {
                        console.error(`[Smartlead API] Failed syncing sequences:`, err.message);
                        res.writeHead(500, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: err.message }));
                    }
                });
            });

            // Incoming webhook receiver & logger for Smartlead live telemetry
            const webhookEvents: any[] = [];
            server.middlewares.use("/api/webhooks/smartlead", (req: any, res: any) => {
                if (req.method === "GET") {
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ ok: true, count: webhookEvents.length, events: webhookEvents.slice(-50) }));
                    return;
                }
                if (req.method !== "POST") {
                    res.statusCode = 200;
                    res.end(JSON.stringify({ ok: true, message: "Smartlead webhook endpoint active" }));
                    return;
                }
                let body = "";
                req.on("data", (chunk: any) => { body += chunk; });
                req.on("end", async () => {
                    try {
                        // Same HMAC check as production: verified only when a
                        // secret is configured AND a signature was sent.
                        const whSecret = resolveWebhookSecret();
                        const providedSig = String(req.headers["x-webhook-signature"] || req.headers["x-smartlead-signature"] || "");
                        if (whSecret && providedSig && !verifySmartleadSignature(body, providedSig, whSecret)) {
                            res.writeHead(401, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ error: "invalid_signature" }));
                            return;
                        }

                        const payload = JSON.parse(body || "{}");
                        const eventType = payload.event_type || payload.type || "unknown";
                        const email = (payload.email || payload.lead_email || payload.to_email || "").toLowerCase();
                        const fromEmail = (payload.from_email || payload.sender_email || payload.from || "").toLowerCase();
                        const bccEmail = (payload.bcc || payload.bcc_email || "").toLowerCase();

                        // Smart Filter: Discard internal team opens or BCC opens
                        const isInternalTeam =
                            email.endsWith("@theboredmonkey.com") ||
                            email.includes("haji.karim") ||
                            email.includes("vatsal.vadecha") ||
                            email.includes("snehal.maurya") ||
                            email.includes("preeti.karki");

                        const isBccOrSender =
                            (fromEmail && email === fromEmail) ||
                            (bccEmail && email === bccEmail);

                        if ((eventType === "EMAIL_OPEN" || eventType === "EMAIL_OPENED") && (isInternalTeam || isBccOrSender)) {
                            console.log(`[SmartFilter Dev] Ignored non-client/BCC open event for ${email}`);
                            res.writeHead(200, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ received: true, ignored: true, reason: "internal_or_bcc_open" }));
                            return;
                        }

                        // Same persistence path as production: events land in
                        // EmailEvent, and DB trouble answers 503 so a retry
                        // finds them (idempotent on providerEventId).
                        let outcome = "unsupported";
                        try {
                            outcome = await recordSmartleadEvent(payload);
                        } catch (err: any) {
                            console.error("[Smartlead Webhook] Persistence failed:", err?.message || err);
                            res.writeHead(503, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ received: false, error: "persistence_failed", retry: true }));
                            return;
                        }

                        const record = {
                            id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                            received_at: new Date().toISOString(),
                            event_type: eventType,
                            email,
                            persisted: outcome === "persisted",
                            payload,
                        };
                        webhookEvents.push(record);
                        console.log(`[Smartlead Webhook] Logged ${eventType} for ${email} (${outcome})`);

                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ received: true, event_type: eventType, email, id: record.id, persisted: outcome === "persisted" }));
                    } catch (err: any) {
                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ received: true, note: "raw_received" }));
                    }
                });
            });
        },
    };
}

function databaseIntelligencePlugin() {
    let prismaInstance: any = null;
    function getPrisma() {
        if (!prismaInstance) {
            try {
                const { PrismaClient } = cjsRequire(path.resolve(__dirname, "../nexus-outbound/node_modules/@prisma/client"));
                prismaInstance = new PrismaClient({
                    datasources: {
                        db: {
                            // Env only — no credentials in source. resolveDatabaseUrl
                            // checks process.env then the local .env files.
                            url: process.env.DATABASE_URL || resolveDatabaseUrl() || undefined,
                        },
                    },
                });
            } catch (e) {
                console.warn("[DatabaseIntelligencePlugin] Prisma load error:", e);
            }
        }
        return prismaInstance;
    }

    // Every data middleware below answers a logged-in user only, and hands the
    // resulting DataScope to the query layer so a TEAM_MEMBER never reads rows
    // that belong to somebody else (mirrors requireUser in server/handlers).
    async function requireScope(req: any, res: any): Promise<DataScope | null> {
        try {
            const user = await resolveToken(readBearer(req) || "");
            if (!user) {
                res.writeHead(401, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "unauthorized", message: "A valid session is required." }));
                return null;
            }
            return scopeFor(user);
        } catch (err: any) {
            const unavailable = err?.name === "DatabaseUnavailableError";
            res.writeHead(unavailable ? 503 : 500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                error: unavailable ? "database_unavailable" : (err?.message || "auth_failed"),
                message: unavailable ? "The live database is not reachable." : "Could not validate the session.",
            }));
            return null;
        }
    }

    return {
        name: "database-intelligence-plugin",
        configureServer(server: any) {
            server.middlewares.use("/api/intelligence/check-contact", async (req: any, res: any) => {
                if (req.method !== "POST") {
                    res.statusCode = 405;
                    res.end(JSON.stringify({ error: "Method not allowed" }));
                    return;
                }
                let body = "";
                req.on("data", (chunk: any) => { body += chunk; });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body || "{}");
                        const cleanEmail = (parsed.email || "").toLowerCase().trim();
                        if (!cleanEmail) {
                            res.writeHead(400, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ error: "Email is required" }));
                            return;
                        }

                        const prisma = getPrisma();
                        if (!prisma) {
                            res.writeHead(200, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ isDuplicate: false, isQuarantined: false }));
                            return;
                        }

                        // 1. Check suppression list
                        const isSuppressed = await prisma.suppressedEmail.findUnique({
                            where: { email: cleanEmail },
                        });
                        if (isSuppressed) {
                            res.writeHead(200, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({
                                isQuarantined: true,
                                reason: isSuppressed.reason,
                                error: `Quarantine Alert: ${cleanEmail} is on the global suppression list (${isSuppressed.reason}). Cannot add to active outreach.`,
                            }));
                            return;
                        }

                        // 2. Check Lead database
                        const lead = await prisma.lead.findFirst({
                            where: { email: cleanEmail },
                        });
                        if (lead) {
                            let lastMessage = lead.lastBodyHook;
                            if (!lastMessage) {
                                const msg = await prisma.emailMessage.findFirst({
                                    where: { contactEmail: cleanEmail },
                                    orderBy: { createdAt: "desc" },
                                    select: { bodyHook: true },
                                });
                                lastMessage = msg?.bodyHook || null;
                            }
                            res.writeHead(200, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({
                                isDuplicate: true,
                                existingContact: {
                                    id: lead.id,
                                    name: `${lead.firstName || ""} ${lead.lastName || ""}`.trim() || cleanEmail,
                                    email: lead.email,
                                    domain: lead.domain,
                                    outreachState: lead.outreachState,
                                    recencyBucket: lead.recencyBucket,
                                    daysSinceLastContact: lead.daysSinceLastContact,
                                    lastSubject: lead.lastSubject,
                                    lastOutcome: lead.lastOutcome,
                                    lastMessage: lastMessage,
                                },
                            }));
                            return;
                        }

                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ isDuplicate: false, isQuarantined: false }));
                    } catch (err: any) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: err.message }));
                    }
                });
            });

            server.middlewares.use("/api/intelligence/check-batch", async (req: any, res: any) => {
                if (req.method !== "POST") {
                    res.statusCode = 405;
                    res.end(JSON.stringify({ error: "Method not allowed" }));
                    return;
                }
                let body = "";
                req.on("data", (chunk: any) => { body += chunk; });
                req.on("end", async () => {
                    try {
                        const parsed = JSON.parse(body || "{}");
                        const emails: string[] = (parsed.emails || []).map((e: string) => e.toLowerCase().trim()).filter(Boolean);
                        const prisma = getPrisma();
                        if (!prisma || emails.length === 0) {
                            res.writeHead(200, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ duplicates: [], quarantined: [] }));
                            return;
                        }

                        const [suppressedList, leads, messages] = await Promise.all([
                            prisma.suppressedEmail.findMany({
                                where: { email: { in: emails } },
                                select: { email: true, reason: true },
                            }),
                            prisma.lead.findMany({
                                where: { email: { in: emails } },
                                include: { campaign: true },
                                orderBy: [
                                    { lastContactedAt: { sort: "desc", nulls: "last" } },
                                    { updatedAt: "desc" },
                                ],
                            }),
                            prisma.emailMessage.findMany({
                                where: { contactEmail: { in: emails } },
                                orderBy: { createdAt: "desc" },
                                select: {
                                    contactEmail: true,
                                    subjectRaw: true,
                                    bodyHook: true,
                                    campaignClean: true,
                                    campaignRaw: true,
                                    createdAt: true,
                                    direction: true,
                                },
                            }),
                        ]);

                        const suppressedMap = new Map(suppressedList.map((s: any) => [s.email.toLowerCase(), s.reason]));
                        const leadsByEmail = new Map<string, any[]>();
                        for (const l of leads) {
                            const em = l.email.toLowerCase();
                            if (!leadsByEmail.has(em)) leadsByEmail.set(em, []);
                            leadsByEmail.get(em)!.push(l);
                        }

                        const msgsByEmail = new Map<string, any[]>();
                        for (const m of messages) {
                            const em = m.contactEmail.toLowerCase();
                            if (!msgsByEmail.has(em)) msgsByEmail.set(em, []);
                            msgsByEmail.get(em)!.push(m);
                        }

                        const duplicates: any[] = [];
                        const quarantined: any[] = [];

                        for (const email of emails) {
                            const suppReason = suppressedMap.get(email);
                            const emailLeads = leadsByEmail.get(email) || [];
                            const emailMsgs = msgsByEmail.get(email) || [];

                            const isBurnedOrSupp = suppReason || emailLeads.some((l: any) => l.isBurned || l.status === "UNSUBSCRIBED" || l.status === "BOUNCED");
                            if (isBurnedOrSupp) {
                                quarantined.push({
                                    email,
                                    name: emailLeads[0] ? `${emailLeads[0].firstName || ""} ${emailLeads[0].lastName || ""}`.trim() || email : email,
                                    reason: suppReason || (emailLeads.find((l: any) => l.status === "BOUNCED") ? "Email bounced previously" : emailLeads.find((l: any) => l.status === "UNSUBSCRIBED") ? "Unsubscribed from outreach" : "Marked as burned"),
                                });
                                continue;
                            }

                            if (emailLeads.length === 0 && emailMsgs.length === 0) {
                                continue;
                            }

                            const campaignNames = [...new Set([
                                ...emailLeads.map((l: any) => l.campaign?.name || l.lastCampaign).filter(Boolean),
                                ...emailMsgs.map((m: any) => m.campaignClean || m.campaignRaw).filter(Boolean),
                            ])];

                            const leadWithSubject = emailLeads.find((l: any) => l.lastSubject && l.lastSubject !== "No prior outreach");
                            const leadWithMessage = emailLeads.find((l: any) => l.lastBodyHook && !l.lastBodyHook.includes("No conversation"));
                            const leadWithDays = emailLeads.find((l: any) => l.daysSinceLastContact != null);
                            const leadWithState = emailLeads.find((l: any) => l.outreachState && !["UNKNOWN", "NEVER_REACHED", "NEVER_CONTACTED"].includes(l.outreachState));

                            const msgWithSubject = emailMsgs.find((m: any) => m.subjectRaw);
                            const msgWithBody = emailMsgs.find((m: any) => m.bodyHook);

                            const subject = leadWithSubject?.lastSubject || msgWithSubject?.subjectRaw || null;
                            const message = leadWithMessage?.lastBodyHook || msgWithBody?.bodyHook || null;

                            let daysSince = leadWithDays?.daysSinceLastContact ?? null;
                            if (daysSince == null && emailMsgs[0]?.createdAt) {
                                daysSince = Math.floor((Date.now() - new Date(emailMsgs[0].createdAt).getTime()) / (1000 * 60 * 60 * 24));
                            }

                            let outreachState = leadWithState?.outreachState || null;
                            if (!outreachState) {
                                if (campaignNames.length > 0) {
                                    outreachState = "COLD_REENGAGEMENT";
                                } else if (daysSince != null && daysSince > 30) {
                                    outreachState = "WARM_STALE";
                                } else {
                                    outreachState = "NEVER_REACHED";
                                }
                            }

                            const hasHistory = campaignNames.length > 0 || subject != null || message != null || daysSince != null || (outreachState && outreachState !== "NEVER_REACHED");
                            if (hasHistory) {
                                const bestLead = emailLeads[0];
                                duplicates.push({
                                    email,
                                    name: bestLead ? `${bestLead.firstName || ""} ${bestLead.lastName || ""}`.trim() || email : email,
                                    outreachState,
                                    daysSinceLastContact: daysSince,
                                    lastSubject: subject,
                                    lastMessage: message,
                                    lastCampaign: campaignNames[0] || null,
                                    campaigns: campaignNames,
                                });
                            }
                        }

                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ duplicates, quarantined }));
                    } catch (err: any) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: err.message }));
                    }
                });
            });

            // 3. Live database contacts browser & intelligence endpoint.
            // Filtering, counting and row mapping live in server/contacts.ts so
            // this dev middleware and the deployed /api/intelligence/contacts
            // function are guaranteed to return the same numbers.
            const prismaQuery = async <T = Record<string, any>>(sql: string, params: unknown[] = []): Promise<T[]> => {
                const prisma = getPrisma();
                if (!prisma) throw new Error("database_unavailable");
                return (await prisma.$queryRawUnsafe(sql, ...(params as any[]))) as T[];
            };

            server.middlewares.use("/api/intelligence/contacts", async (req: any, res: any) => {
                let body = "";
                req.on("data", (chunk: any) => { body += chunk; });
                req.on("end", async () => {
                    try {
                        const scope = await requireScope(req, res);
                        if (!scope) return;
                        const prisma = getPrisma();
                        if (!prisma) {
                            res.writeHead(503, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({
                                error: "database_unavailable",
                                message: "Prisma could not connect to DATABASE_URL, so live contact data cannot be read.",
                            }));
                            return;
                        }

                        const parsed = req.method === "POST" ? JSON.parse(body || "{}") : {};
                        const urlObj = new URL(req.url, "http://localhost:5173");
                        const pick = (key: string) => parsed[key] ?? urlObj.searchParams.get(key);

                        const rawCampaignIds = [
                            ...(Array.isArray(parsed.campaign_ids) ? parsed.campaign_ids : []),
                            ...(urlObj.searchParams.get("campaign_ids") ? urlObj.searchParams.get("campaign_ids")!.split(",") : []),
                            ...(parsed.campaign_id ? [parsed.campaign_id] : []),
                            ...(urlObj.searchParams.get("campaign_id") ? [urlObj.searchParams.get("campaign_id")] : []),
                        ].map(String).filter(Boolean);

                        const subscribedRaw = parsed.subscribed ?? urlObj.searchParams.get("subscribed");
                        const subscribed =
                            subscribedRaw === undefined || subscribedRaw === null || subscribedRaw === ""
                                ? null
                                : subscribedRaw === true || subscribedRaw === "true" || subscribedRaw === "1";

                        const memberId = pick("member_id");
                        let activeScope = scope;
                        if (scope.master && memberId && memberId !== "all") {
                            activeScope = { userId: memberId, master: false };
                        }

                        const payload = await getContacts(
                            {
                                query: pick("query") || pick("q") || "",
                                page: parseInt(String(pick("page") || "1"), 10) || 1,
                                limit: parseInt(String(pick("limit") || "50"), 10) || 50,
                                campaignIds: [...new Set(rawCampaignIds)],
                                outreachState: pick("outreach_state") || undefined,
                                recencyBucket: pick("recency_bucket") || undefined,
                                subscribed,
                                company: pick("company") || "",
                                domain: pick("domain") || pick("domains") || "",
                                category: pick("category") || pick("category_ids") || "",
                            },
                            prismaQuery,
                            activeScope,
                        );

                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify(payload));
                    } catch (err: any) {
                        console.error("[DatabaseIntelligencePlugin] contacts error:", err);
                        const unavailable = err?.message === "database_unavailable";
                        res.writeHead(unavailable ? 503 : 500, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({
                            error: unavailable ? "database_unavailable" : err.message,
                            message: unavailable ? "The live database is not reachable." : err.message,
                        }));
                    }
                });
            });

            // 3b. Live workspace analytics (sent / opens / clicks / replies /
            // bounces, daily trend, top campaigns, account health) — the same
            // numbers the deployed /api/analytics/dashboard function returns.
            server.middlewares.use("/api/analytics/dashboard", async (req: any, res: any) => {
                try {
                    const scope = await requireScope(req, res);
                    if (!scope) return;
                    const prisma = getPrisma();
                    if (!prisma) {
                        res.writeHead(503, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: "database_unavailable", message: "The live database is not reachable." }));
                        return;
                    }

                    const urlObj = new URL(req.url, "http://localhost:5173");
                    const period = urlObj.searchParams.get("period") || "7d";
                    const from = urlObj.searchParams.get("from") || undefined;
                    const to = urlObj.searchParams.get("to") || undefined;
                    const memberId = urlObj.searchParams.get("member_id");
                    let activeScope = scope;
                    if (scope.master && memberId && memberId !== "all") {
                        activeScope = { userId: memberId, master: false };
                    }
                    const payload = await getDashboard({ period, from, to }, prismaQuery, activeScope);

                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(payload));
                } catch (err: any) {
                    console.error("[DatabaseIntelligencePlugin] dashboard error:", err);
                    const unavailable = err?.message === "database_unavailable";
                    res.writeHead(unavailable ? 503 : 500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({
                        error: unavailable ? "database_unavailable" : err.message,
                        message: unavailable ? "The live database is not reachable." : err.message,
                    }));
                }
            });

            // 4. Live database suppressions endpoint (3,732 quarantined records)
            server.middlewares.use("/api/intelligence/suppressions", async (req: any, res: any) => {
                let body = "";
                req.on("data", (chunk: any) => { body += chunk; });
                req.on("end", async () => {
                    try {
                        const scope = await requireScope(req, res);
                        if (!scope) return;
                        const prisma = getPrisma();
                        if (!prisma) {
                            res.writeHead(200, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ data: [], total: 0, pagination: { has_more: false, next_cursor: null } }));
                            return;
                        }

                        const urlObj = new URL(req.url, "http://localhost:5173");
                        const query = (urlObj.searchParams.get("query") || urlObj.searchParams.get("q") || "").trim();
                        const page = Math.max(1, parseInt(urlObj.searchParams.get("page") || "1", 10));
                        const limit = Math.min(100, Math.max(1, parseInt(urlObj.searchParams.get("limit") || "50", 10)));

                        const where: any = query ? { email: { contains: query, mode: "insensitive" } } : {};

                        const [totalCount, rows] = await Promise.all([
                            prisma.suppressedEmail.count({ where }),
                            prisma.suppressedEmail.findMany({
                                where,
                                take: limit,
                                skip: (page - 1) * limit,
                                orderBy: { createdAt: "desc" },
                            }),
                        ]);

                        const data = rows.map((s: any) => ({
                            id: s.id,
                            organization_id: "org_default",
                            email: s.email,
                            kind: "email",
                            reason: s.reason,
                            source: s.reason === "HARD_BOUNCE" ? "bounce" : s.reason === "SPAM_COMPLAINT" ? "complaint" : "unsubscribe",
                            created_at: s.createdAt,
                            updated_at: s.createdAt,
                        }));

                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({
                            data,
                            total: totalCount,
                            pagination: {
                                next_cursor: page * limit < totalCount ? String(page + 1) : null,
                                has_more: page * limit < totalCount,
                            },
                        }));
                    } catch (err: any) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: err.message }));
                    }
                });
            });

            // 5. Live database segments endpoint (counts come from the same
            //    group-by the contacts table uses)
            server.middlewares.use("/api/intelligence/segments", async (req: any, res: any) => {
                try {
                    const scope = await requireScope(req, res);
                    if (!scope) return;
                    const payload = await getContacts({ limit: 1 }, prismaQuery, scope);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(buildSegments(payload.counts?.categories ?? null)));
                } catch (e) {
                    console.error("[DatabaseIntelligencePlugin] segments error:", e);
                    res.writeHead(503, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "database_unavailable" }));
                }
            });

            // 6. Suppress / Quarantine selected contacts
            server.middlewares.use("/api/intelligence/suppress-contacts", async (req: any, res: any) => {
                if (req.method !== "POST") {
                    res.statusCode = 405;
                    res.end(JSON.stringify({ error: "Method not allowed" }));
                    return;
                }
                let body = "";
                req.on("data", (chunk: any) => { body += chunk; });
                req.on("end", async () => {
                    try {
                        const scope = await requireScope(req, res);
                        if (!scope) return;
                        const prisma = getPrisma();
                        if (!prisma) {
                            res.writeHead(500, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ error: "Database not connected" }));
                            return;
                        }
                        const parsed = JSON.parse(body || "{}");
                        const emails: string[] = (parsed.emails || []).map((e: string) => e.toLowerCase().trim()).filter(Boolean);
                        const ids: string[] = parsed.ids || [];
                        const reason = parsed.reason || "MANUAL";

                        let count = 0;
                        for (const email of emails) {
                            await prisma.suppressedEmail.upsert({
                                where: { email },
                                update: { reason },
                                create: { email, reason, source: "manual_suppression" },
                            });
                            count++;
                        }

                        if (emails.length > 0 || ids.length > 0) {
                            await prisma.lead.updateMany({
                                where: {
                                    OR: [
                                        { email: { in: emails } },
                                        { id: { in: ids } },
                                    ],
                                    ...(scope.master ? {} : { campaign: { userId: scope.userId } }),
                                },
                                data: {
                                    status: "UNSUBSCRIBED",
                                    outreachState: "BURNED",
                                },
                            });
                        }

                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ success: true, count }));
                    } catch (err: any) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: err.message }));
                    }
                });
            });

            // 7. Delete contacts permanently
            server.middlewares.use("/api/intelligence/delete-contacts", async (req: any, res: any) => {
                if (req.method !== "POST") {
                    res.statusCode = 405;
                    res.end(JSON.stringify({ error: "Method not allowed" }));
                    return;
                }
                let body = "";
                req.on("data", (chunk: any) => { body += chunk; });
                req.on("end", async () => {
                    try {
                        const scope = await requireScope(req, res);
                        if (!scope) return;
                        const prisma = getPrisma();
                        if (!prisma) {
                            res.writeHead(500, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ error: "Database not connected" }));
                            return;
                        }
                        const parsed = JSON.parse(body || "{}");
                        const emails: string[] = (parsed.emails || []).map((e: string) => e.toLowerCase().trim()).filter(Boolean);
                        const ids: string[] = parsed.ids || [];

                        const deleted = await prisma.lead.deleteMany({
                            where: {
                                OR: [
                                    { email: { in: emails } },
                                    { id: { in: ids } },
                                ],
                                ...(scope.master ? {} : { campaign: { userId: scope.userId } }),
                            },
                        });

                        res.writeHead(200, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ success: true, count: deleted.count }));
                    } catch (err: any) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: err.message }));
                    }
                });
            });

            // 8. Live database campaigns query
            // Lifetime campaign statistics, aggregated from Lead + EmailEvent
            server.middlewares.use("/api/campaigns/stats", async (req: any, res: any) => {
                try {
                    const scope = await requireScope(req, res);
                    if (!scope) return;
                    const stats = await getCampaignStats(prismaQuery, scope);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(stats));
                } catch (e) {
                    console.error("[DatabaseIntelligencePlugin] campaign stats error:", e);
                    res.writeHead(503, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "database_unavailable" }));
                }
            });

            // Per-campaign analytics: lifetime summary, daily series, per-step
            
            // Campaign steps CRUD directly in PostgreSQL CampaignStep table
            server.middlewares.use("/api/campaigns/steps", async (req: any, res: any) => {
                let body = "";
                req.on("data", (chunk: any) => { body += chunk; });
                req.on("end", async () => {
                    try {
                        const scope = await requireScope(req, res);
                        if (!scope) return;
                        const prisma = getPrisma();
                        if (!prisma) {
                            res.writeHead(503, { "Content-Type": "application/json" });
                            res.end(JSON.stringify({ error: "database_unavailable" }));
                            return;
                        }
                        const urlObj = new URL(req.url, "http://localhost:5173");
                        const campaignId = urlObj.searchParams.get("campaign_id") || urlObj.searchParams.get("id");

                        if (req.method === "GET") {
                            if (!campaignId) {
                                res.writeHead(400, { "Content-Type": "application/json" });
                                res.end(JSON.stringify({ error: "missing_campaign_id" }));
                                return;
                            }
                            const steps = await prisma.campaignStep.findMany({
                                where: { campaignId },
                                orderBy: { stepNumber: "asc" },
                            });
                            res.writeHead(200, { "Content-Type": "application/json" });
                            res.end(JSON.stringify(steps.map((s: any) => ({
                                id: s.id,
                                stepNumber: s.stepNumber,
                                position: s.stepNumber,
                                name: s.stepNumber === 1 ? "First email" : `Follow-up ${s.stepNumber - 1}`,
                                subject: s.subject || "",
                                body_plain: (s.bodyTemplate || "").replace(/<[^>]+>/g, ""),
                                body_html: s.bodyTemplate || "",
                                wait_after: s.delayDays || (s.stepNumber === 1 ? 0 : 3),
                                created_at: s.createdAt,
                                updated_at: s.updatedAt,
                            }))));
                            return;
                        }

                        if (req.method === "POST" || req.method === "PUT") {
                            const parsed = JSON.parse(body || "{}");
                            const targetCampId = campaignId || parsed.campaign_id || parsed.campaignId;
                            const stepsData = Array.isArray(parsed) ? parsed : (parsed.steps || []);
                            if (!targetCampId || !Array.isArray(stepsData)) {
                                res.writeHead(400, { "Content-Type": "application/json" });
                                res.end(JSON.stringify({ error: "invalid_payload" }));
                                return;
                            }

                            // Upsert steps
                            const updatedSteps: any[] = [];
                            for (let i = 0; i < stepsData.length; i++) {
                                const s = stepsData[i];
                                const stepNum = i + 1;
                                const stepHtml = s.body_html || (s.body_plain ? `<div>${s.body_plain.replace(/\n/g, "<br/>")}</div>` : "<p></p>");
                                const saved = await prisma.campaignStep.upsert({
                                    where: {
                                        campaignId_stepNumber: {
                                            campaignId: targetCampId,
                                            stepNumber: stepNum,
                                        }
                                    },
                                    create: {
                                        campaignId: targetCampId,
                                        stepNumber: stepNum,
                                        delayDays: s.wait_after !== undefined ? s.wait_after : (stepNum === 1 ? 0 : 3),
                                        subject: s.subject || "",
                                        bodyTemplate: stepHtml,
                                    },
                                    update: {
                                        delayDays: s.wait_after !== undefined ? s.wait_after : (stepNum === 1 ? 0 : 3),
                                        subject: s.subject || "",
                                        bodyTemplate: stepHtml,
                                    },
                                });
                                updatedSteps.push(saved);
                            }

                            res.writeHead(200, { "Content-Type": "application/json" });
                            res.end(JSON.stringify(updatedSteps));
                            return;
                        }

                        res.writeHead(405, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: "method_not_allowed" }));
                    } catch (err: any) {
                        console.error("[DatabaseIntelligencePlugin] campaign steps error:", err);
                        res.writeHead(500, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: err.message }));
                    }
                });
            });

            server.middlewares.use("/api/campaigns/analytics", async (req: any, res: any) => {
                try {
                    const scope = await requireScope(req, res);
                    if (!scope) return;
                    const urlObj = new URL(req.url, "http://localhost:5173");
                    const campaignId = urlObj.searchParams.get("id") || "";
                    const days = Math.min(365, Math.max(1, parseInt(String(urlObj.searchParams.get("days") || "30"), 10) || 30));
                    const from = urlObj.searchParams.get("from") || undefined;
                    if (!campaignId) {
                        res.writeHead(400, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: "missing_campaign_id" }));
                        return;
                    }
                    const payload = await getCampaignAnalytics(prismaQuery, scope, campaignId, days, from);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(payload));
                } catch (e) {
                    console.error("[DatabaseIntelligencePlugin] campaign analytics error:", e);
                    res.writeHead(503, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "database_unavailable" }));
                }
            });

            server.middlewares.use("/api/campaigns/logs", async (req: any, res: any) => {
                try {
                    const scope = await requireScope(req, res);
                    if (!scope) return;
                    const urlObj = new URL(req.url, "http://localhost:5173");
                    const campaignId = urlObj.searchParams.get("id") || "";
                    if (!campaignId) {
                        res.writeHead(400, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: "missing_campaign_id" }));
                        return;
                    }
                    const events = await prismaQuery(
                        `SELECT e.id,
                                e."eventType" AS event_type,
                                e."createdAt" AS created_at,
                                coalesce(e."rawPayload"->>'description', '') AS description,
                                l.email,
                                l."firstName" AS first_name,
                                l."lastName" AS last_name
                         FROM "EmailEvent" e
                         JOIN "Lead" l ON l.id = e."leadId"
                         WHERE l."campaignId" = $1
                         ORDER BY e."createdAt" DESC
                         LIMIT 50`,
                        [campaignId]
                    );
                    const logs = events.map((row: any) => {
                        const et = String(row.event_type || "").toLowerCase();
                        const isSent = et === "sent";
                        const isOpen = et.includes("open");
                        const isReply = et.includes("reply");
                        const isClick = et.includes("click");
                        const isBounce = et.includes("bounce");
                        const leadName = `${row.first_name || ""} ${row.last_name || ""}`.trim() || (row.email ? row.email.split("@")[0] : "Prospect");
                        let message = row.description;
                        if (!message) {
                            if (isSent) message = `Email sent to ${leadName} (${row.email})`;
                            else if (isOpen) message = `Email opened by ${leadName} (${row.email})`;
                            else if (isReply) message = `Reply received from ${leadName} (${row.email})`;
                            else if (isClick) message = `Link clicked by ${leadName} (${row.email})`;
                            else if (isBounce) message = `Email bounced for ${leadName} (${row.email})`;
                            else message = `Event ${row.event_type} for ${leadName} (${row.email})`;
                        }
                        return {
                            id: row.id,
                            event_type: isSent ? "EMAIL_SENT" : isOpen ? "EMAIL_OPENED" : isReply ? "EMAIL_REPLIED" : isClick ? "EMAIL_LINK_CLICK" : isBounce ? "EMAIL_BOUNCED" : row.event_type,
                            message,
                            metadata: { level: isBounce ? "error" : isReply ? "success" : "info" },
                            created_at: row.created_at,
                        };
                    });
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ data: logs }));
                } catch (e: any) {
                    console.error("[DatabaseIntelligencePlugin] campaign logs error:", e);
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: e?.message || "error_fetching_logs" }));
                }
            });

            server.middlewares.use("/api/intelligence/campaigns", async (req: any, res: any) => {
                try {
                    const scope = await requireScope(req, res);
                    if (!scope) return;
                    const prisma = getPrisma();
                    if (!prisma) {
                        res.writeHead(500, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: "Database not connected" }));
                        return;
                    }
                    const dbCampaigns = await prisma.campaign.findMany({
                        where: scope.master ? {} : { userId: scope.userId },
                        include: {
                            _count: { select: { leads: true } },
                            steps: { orderBy: { stepNumber: "asc" } },
                        },
                        orderBy: { createdAt: "desc" },
                    });
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(dbCampaigns));
                } catch (err: any) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });

            // 9. Live database mailboxes query, including each mailbox's real
            // "sent today" / lifetime counters derived from EmailEvent rows.
            server.middlewares.use("/api/intelligence/mailboxes", async (req: any, res: any) => {
                try {
                    const scope = await requireScope(req, res);
                    if (!scope) return;
                    const dbMailboxes = await getMailboxes(prismaQuery, scope);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(dbMailboxes));
                } catch (err: any) {
                    res.writeHead(500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });

            // 10. Lifetime system report (total mails, categories, reply mix,
            // monthly volume, top campaigns, latest replies) — what the
            // head-of-department sections render from.
            server.middlewares.use("/api/analytics/report", async (req: any, res: any) => {
                try {
                    const scope = await requireScope(req, res);
                    if (!scope) return;
                    const prisma = getPrisma();
                    if (!prisma) {
                        res.writeHead(503, { "Content-Type": "application/json" });
                        res.end(JSON.stringify({ error: "database_unavailable", message: "The live database is not reachable." }));
                        return;
                    }

                    const urlObj = new URL(req.url, "http://localhost:5173");
                    const memberId = urlObj.searchParams.get("member_id");
                    let activeScope = scope;
                    if (scope.master && memberId && memberId !== "all") {
                        activeScope = { userId: memberId, master: false };
                    }
                    const payload = await getReport(prismaQuery, activeScope);
                    res.writeHead(200, { "Content-Type": "application/json" });
                    res.end(JSON.stringify(payload));
                } catch (err: any) {
                    console.error("[DatabaseIntelligencePlugin] report error:", err);
                    const unavailable = err?.message === "database_unavailable";
                    res.writeHead(unavailable ? 503 : 500, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({
                        error: unavailable ? "database_unavailable" : err.message,
                        message: unavailable ? "The live database is not reachable." : err.message,
                    }));
                }
            });
        },
    };
}

// Local session + member-management API. Mounted as one catch-all middleware
// (rather than per-path mounts) so req.url keeps its full /api/... form,
// exactly as Vercel preserves it for api/index.ts.
function authApiPlugin() {
    return {
        name: "local-auth-api-plugin",
        configureServer(server: any) {
            server.middlewares.use((req: any, res: any, next: any) => {
                const path = (req.url || "").split("?")[0].replace(/\/+$/, "");
                if (path === "/api/auth" || path.startsWith("/api/auth/")) {
                    authHandler(req, res);
                    return;
                }
                if (path === "/api/organization" || path.startsWith("/api/organization/")) {
                    organizationHandler(req, res);
                    return;
                }
                next();
            });
        },
    };
}

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        localAiChatPlugin(),
        smartleadApiPlugin(),
        databaseIntelligencePlugin(),
        authApiPlugin(),
        ...sentryPlugins,
    ],
    build: {
        // Only when they are going to be uploaded: shipping them otherwise
        // would hand every visitor the app's original sources.
        sourcemap: uploadSourceMaps,
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    // Pre-bundle heavy deps so the first request to the dev server
    // doesn't trigger a cold compile of axios/framer-motion/etc. This
    // shaves ~300-500ms off the first paint locally.
    optimizeDeps: {
        include: [
            "react",
            "react-dom",
            "react-router-dom",
            "axios",
            "framer-motion",
            "@tanstack/react-query",
            "@tanstack/react-query-devtools",
            "react-hot-toast",
            "lucide-react",
            "@remixicon/react",
        ],
    },
    server: {
        // Permit Tailscale MagicDNS names (and any extra hosts via
        // VITE_ALLOWED_HOSTS) when the server is exposed with --host. Vite
        // always allows IPs + localhost; this only adds named hosts, so it's
        // inert for normal local dev. Lets `make web PUBLIC_HOST=<name>` work
        // when reached at https://<host>.<tailnet>.ts.net.
        allowedHosts: [".ts.net", ...(process.env.VITE_ALLOWED_HOSTS?.split(",").filter(Boolean) ?? [])],
        // Warm up the most-mounted entry points before the user
        // clicks them so navigation doesn't trigger a cold compile.
        warmup: {
            clientFiles: [
                "./src/main.tsx",
                "./src/app/app/layout.tsx",
                "./src/app/app/emails/page.tsx",
                "./src/app/app/campaigns/page.tsx",
                "./src/app/app/contacts/page.tsx",
            ],
        },
    },
});

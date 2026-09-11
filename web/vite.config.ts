import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";

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
                        const apiKey = process.env.OPENAI_API_KEY || "";

                        const payload = JSON.stringify({
                            model: "gpt-4o-mini",
                            stream: true,
                            messages: [
                                {
                                    role: "system",
                                    content: `You are the AI Assistant for TheBoredMonkey Outreach (Email System 101).
Owner: Haji Karim (haji.karim@theboredmonkey.com)
Workspace Data & Telemetry:
- 2 Mailboxes: haji.karim@theboredmonkey.com (Healthy, Warmup Active, 50 limit/day), contact@phonepe.business (Active, 50 limit/day)
- 7 Campaigns: Campaign 106 (Active, 11 leads, 70.5% open rate, 13.6% reply rate), Campaign 108 (Active, 10 leads, 75% open rate, 15% reply rate), Campaigns 101-105 completed.
- 21 Contacts uploaded and verified across fintech, saas, and tech agencies.
- Smartlead tracking domain: mail.theboredmonkey.com (Verified, CNAME target custom.smartlead.ai, SSL Valid).
- Webhook: https://theboredmonkey.com/api/webhooks/smartlead active for sent, open, reply, bounce events.
- Deliverability: 99.2% overall score, SPF pass, DKIM pass, DMARC pass.
- Active unibox conversations: Jane Smith (Fintech Labs - demo booked), Michael Chang (Cloudscale - pricing requested), Sarah Chen (Apex Media).
Answer questions concisely, accurately, and assist with cold email outreach, sequences, copywriting, CRM actions, and campaign optimization. Format responses with clean markdown.`
                                },
                                { role: "user", content: userPrompt || "Provide a quick workspace summary and suggested outreach actions." }
                            ]
                        });

                        res.writeHead(200, {
                            "Content-Type": "text/event-stream; charset=utf-8",
                            "Cache-Control": "no-cache",
                            Connection: "keep-alive"
                        });

                        const openAiReq = https.request("https://api.openai.com/v1/chat/completions", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${apiKey}`,
                                "Content-Length": Buffer.byteLength(payload)
                            }
                        }, (openAiRes) => {
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
                        openAiReq.on("error", (err) => {
                            res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
                            res.end();
                        });
                        openAiReq.write(payload);
                        openAiReq.end();
                    } catch (err: any) {
                        res.statusCode = 500;
                        res.end(JSON.stringify({ error: err?.message || "Internal server error" }));
                    }
                });
            });
        }
    };
}

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        localAiChatPlugin(),
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

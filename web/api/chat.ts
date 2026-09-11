import type { IncomingMessage, ServerResponse } from "http";
import https from "https";

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    if (req.method !== "POST") {
        res.statusCode = 405;
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
    }

    let body = "";
    req.on("data", (chunk: Buffer) => {
        body += chunk.toString();
    });

    req.on("end", () => {
        try {
            const parsed = JSON.parse(body || "{}");
            const userPrompt = (parsed.prompt || parsed.text || parsed.message || "").trim();
            const apiKey = process.env.OPENAI_API_KEY || "";

            if (!apiKey) {
                res.writeHead(200, {
                    "Content-Type": "text/event-stream; charset=utf-8",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                });
                res.write(`data: ${JSON.stringify({
                    type: "text",
                    text: "⚠️ **Server Configuration Required**: Please set the `OPENAI_API_KEY` environment variable in your Vercel Project Settings (Settings -> Environment Variables) to enable live GPT-4o-mini reasoning.",
                })}\n\n`);
                res.write(`data: ${JSON.stringify({ type: "done", credits_remaining: 9999 })}\n\n`);
                res.end();
                return;
            }

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
Answer questions concisely, accurately, and assist with cold email outreach, sequences, copywriting, CRM actions, and campaign optimization. Format responses with clean markdown.`,
                    },
                    { role: "user", content: userPrompt || "Provide a quick workspace summary and suggested outreach actions." },
                ],
            });

            res.writeHead(200, {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            });

            const openAiReq = https.request(
                "https://api.openai.com/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey}`,
                        "Content-Length": Buffer.byteLength(payload),
                    },
                },
                (openAiRes) => {
                    let fullText = "";
                    let buffer = "";

                    openAiRes.on("data", (chunk: Buffer) => {
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
                },
            );

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
}

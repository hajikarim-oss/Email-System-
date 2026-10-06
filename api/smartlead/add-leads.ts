import type { IncomingMessage, ServerResponse } from "http";
import https from "https";
import { smartleadPrimary, smartleadSecondary } from "../../server/smartleadKeys";
import { requireUser } from "../../server/handlers/auth";

const PRIMARY_KEY = smartleadPrimary();
const SECONDARY_KEY = smartleadSecondary();
const BASE_URL = "https://server.smartlead.ai/api/v1";

function apiCall(endpoint: string, method: string = "GET", body?: any, customKey?: string): Promise<{ status: number; data: any }> {
    const apiKey = customKey || PRIMARY_KEY;
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
                    if ((res.statusCode === 401 || res.statusCode === 404) && !customKey && SECONDARY_KEY && apiKey !== SECONDARY_KEY) {
                        try {
                            const fallbackRes = await apiCall(endpoint, method, body, SECONDARY_KEY);
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

function cleanCompanyName(nameOrDomain?: string): string {
    if (!nameOrDomain) return "Enterprise Client";
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

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
        res.statusCode = 200;
        res.end();
        return;
    }

    if (req.method !== "POST") {
        res.statusCode = 405;
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
    }

    const user = await requireUser(req, res);
    if (!user) return;

    let body = "";
    req.on("data", (chunk: any) => { body += chunk.toString(); });
    req.on("end", async () => {
        try {
            const parsed = JSON.parse(body || "{}");
            let smartleadId = parsed.smartlead_id ? Number(parsed.smartlead_id) : null;
            const campaignName = (parsed.campaign_name || parsed.name || "").trim();
            const rawLeads = Array.isArray(parsed.leads) ? parsed.leads : (parsed.lead ? [parsed.lead] : []);
            const chosenKey = parsed.api_key || PRIMARY_KEY;

            // 1. Resolve Smartlead Campaign ID if missing or non-numeric
            if (!smartleadId || isNaN(smartleadId)) {
                const listRes = await apiCall("/campaigns", "GET", undefined, chosenKey);
                const allCamps = Array.isArray(listRes.data) ? listRes.data : [];
                if (campaignName) {
                    const match = allCamps.find((c: any) =>
                        (c.name || "").toLowerCase().trim() === campaignName.toLowerCase() ||
                        c.name.toLowerCase().includes(campaignName.toLowerCase())
                    );
                    if (match) smartleadId = match.id;
                }
            }

            if (!smartleadId || isNaN(smartleadId)) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    error: "smartlead_id_not_found",
                    message: `Could not identify Smartlead campaign for "${campaignName || parsed.smartlead_id}". Please ensure campaign is linked to Smartlead.`,
                }));
                return;
            }

            if (rawLeads.length === 0) {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "no_leads_provided", message: "Leads array is empty." }));
                return;
            }

            // 2. Normalize and deduplicate lead format
            const leadList = rawLeads
                .filter((l: any) => l && (l.email || "").includes("@"))
                .map((l: any) => {
                    const fName = l.first_name || l.firstName || (l.name ? l.name.split(" ")[0] : "") || (l.email ? l.email.split("@")[0] : "Prospect");
                    const lName = l.last_name || l.lastName || (l.name ? l.name.split(" ").slice(1).join(" ") : "") || "";
                    const cName = cleanCompanyName(l.company || l.company_name || l.custom_fields?.company);
                    const jobTitle = l.title || l.role || l.custom_fields?.title || "Decision Maker";
                    return {
                        email: l.email.trim(),
                        first_name: fName.trim(),
                        last_name: lName.trim(),
                        company_name: cName,
                        custom_fields: {
                            title: jobTitle,
                            firstName: fName.trim(),
                            lastName: lName.trim(),
                            company: cName,
                            company_name: cName,
                            ...(l.custom_fields || {}),
                        },
                    };
                });

            // 3. Chunk into batches of up to 400 (Smartlead API maximum bulk size)
            const CHUNK_SIZE = 400;
            let totalUploaded = 0;
            const uploadResults: any[] = [];

            for (let i = 0; i < leadList.length; i += CHUNK_SIZE) {
                const chunk = leadList.slice(i, i + CHUNK_SIZE);
                const pushRes = await apiCall(`/campaigns/${smartleadId}/leads`, "POST", { lead_list: chunk }, chosenKey);
                uploadResults.push(pushRes.data);
                if (pushRes.data?.upload_count) {
                    totalUploaded += Number(pushRes.data.upload_count);
                } else if (pushRes.data?.total_leads) {
                    totalUploaded += Number(pushRes.data.total_leads);
                } else if (pushRes.status === 200) {
                    totalUploaded += chunk.length;
                }
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
                ok: true,
                smartlead_id: smartleadId,
                leads_count: leadList.length,
                uploaded_count: totalUploaded,
                results: uploadResults,
            }));
        } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
        }
    });
}

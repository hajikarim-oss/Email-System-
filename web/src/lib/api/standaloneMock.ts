import type { AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import coreData from "./coreData.json";

// Standalone in-browser database & API dispatcher for TheBoredMonkey Outreach
// Powered by real core data exported from Email System 101 Prisma/Smartlead database

const STORAGE_KEY_PREFIX = "tbm_core_data_v4_";

function loadStorage<T>(key: string, defaultVal: T): T {
    try {
        const item = localStorage.getItem(STORAGE_KEY_PREFIX + key);
        return item ? JSON.parse(item) : defaultVal;
    } catch {
        return defaultVal;
    }
}

function saveStorage<T>(key: string, val: T): void {
    try {
        localStorage.setItem(STORAGE_KEY_PREFIX + key, JSON.stringify(val));
    } catch {}
}

// Initial state data loaded from real Email System 101 core database
const initialEmails = coreData.emails;
const initialCampaigns = coreData.campaigns;
const initialContacts = coreData.contacts;

export async function handleStandaloneRequest(config: AxiosRequestConfig): Promise<AxiosResponse> {
    const rawUrl = config.url ?? "";
    const method = (config.method ?? "GET").toUpperCase();
    
    // Normalize path to ignore /v1 or baseURL
    const path = rawUrl.replace(/^https?:\/\/[^/]+/, "").replace(/^\/v1/, "") || "/";
    const pathWithoutQuery = path.split("?")[0];

    // Helper response builder
    const res = (data: unknown, status = 200): AxiosResponse => ({
        data,
        status,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        config: config as InternalAxiosRequestConfig,
    });

    // 1. Auth & Config
    if (pathWithoutQuery === "/auth/config") {
        return res({
            captcha: false,
            password_login: true,
            login_code: "off",
            registration: "true",
            email_verification: false,
            mail_delivers: true,
            passkeys: false,
            providers: [],
            self_hosted: true,
            billing_enabled: false,
            setup_required: false,
            invites_required: false,
            docs_url: "https://theboredmonkey.com",
            brand: {
                name: "TheBoredMonkey Outreach",
                website_url: "https://theboredmonkey.com",
                website_label: "TheBoredMonkey Outreach",
            },
        });
    }

    if (pathWithoutQuery === "/auth/me") {
        return res({
            id: "usr_tbm_haji",
            email: "haji.karim@theboredmonkey.com",
            first_name: "Haji",
            last_name: "Karim",
            role: "owner",
            avatar_url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=128&auto=format&fit=crop&q=80",
            onboarding_completed_at: "2026-01-15T08:30:00Z",
            created_at: "2026-01-15T08:30:00Z",
        });
    }

    if (pathWithoutQuery === "/auth/login") {
        const token = {
            access_token: "tbm_enterprise_token",
            refresh_token: "tbm_enterprise_refresh_token",
            access_token_expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
            refresh_token_expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
        };
        return res({
            code_required: false,
            two_fa_required: false,
            token,
            ...token,
            user: {
                id: "usr_tbm_haji",
                email: "haji.karim@theboredmonkey.com",
                first_name: "Haji",
                last_name: "Karim",
                role: "owner",
                onboarding_completed_at: "2026-01-15T08:30:00Z",
            },
        });
    }

    if (pathWithoutQuery === "/auth/login/confirm") {
        const token = {
            access_token: "tbm_enterprise_token",
            refresh_token: "tbm_enterprise_refresh_token",
            access_token_expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
            refresh_token_expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
        };
        return res({
            code_required: false,
            two_fa_required: false,
            token,
            ...token,
        });
    }

    if (pathWithoutQuery === "/auth/register") {
        const token = {
            access_token: "tbm_enterprise_token",
            refresh_token: "tbm_enterprise_refresh_token",
            access_token_expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
            refresh_token_expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
        };
        return res({
            code_required: false,
            two_fa_required: false,
            token,
            ...token,
            user: {
                id: "usr_tbm_haji",
                email: "haji.karim@theboredmonkey.com",
                first_name: "Haji",
                last_name: "Karim",
                role: "owner",
                onboarding_completed_at: "2026-01-15T08:30:00Z",
            },
        });
    }

    if (pathWithoutQuery === "/auth/register/confirm") {
        const token = {
            access_token: "tbm_enterprise_token",
            refresh_token: "tbm_enterprise_refresh_token",
            access_token_expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
            refresh_token_expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
        };
        return res({
            code_required: false,
            two_fa_required: false,
            token,
            ...token,
        });
    }

    if (pathWithoutQuery === "/auth/logout") {
        return res({ success: true });
    }

    // 2. Organizations
    if (pathWithoutQuery === "/organization" || pathWithoutQuery === "/organizations") {
        return res([
            {
                id: "org_tbm_main",
                name: "TheBoredMonkey Workspace",
                slug: "theboredmonkey-outreach",
                role: "owner",
                plan: "enterprise",
                permissions: 4294967295,
                created_at: "2026-01-01T00:00:00Z",
            },
        ]);
    }

    if (pathWithoutQuery === "/organization/current" || pathWithoutQuery === "/organizations/current") {
        return res({
            id: "org_tbm_main",
            name: "TheBoredMonkey Workspace",
            slug: "theboredmonkey-outreach",
            role: "owner",
            plan: "enterprise",
            permissions: 4294967295,
            created_at: "2026-01-01T00:00:00Z",
        });
    }

    if (pathWithoutQuery === "/organization/roles") {
        return res([
            { id: "role_owner", name: "Owner", permissions: 4294967295 },
            { id: "role_admin", name: "Admin", permissions: 4294967295 },
            { id: "role_member", name: "Member", permissions: 2047 },
        ]);
    }

    if (pathWithoutQuery.startsWith("/organization/switch/")) {
        return res({ success: true });
    }

    // 3. Subscription & Credits
    if (pathWithoutQuery === "/subscription") {
        return res({
            status: "active",
            plan: {
                id: "enterprise",
                name: "enterprise",
                label: "Enterprise",
                priceMonthly: 0,
            },
        });
    }

    if (pathWithoutQuery === "/subscription/credits") {
        return res({
            unlimited: true,
            balance: 50000,
            monthly_balance: 50000,
            purchased_balance: 0,
            monthly_allowance: 50000,
            total_purchased: 0,
            monthly_reset_at: new Date(Date.now() - 10 * 86400000).toISOString(),
            next_reset_at: new Date(Date.now() + 20 * 86400000).toISOString(),
            packs: [],
        });
    }

    if (pathWithoutQuery === "/subscription/credits/settings") {
        return res({
            low_balance_threshold: 100,
            auto_topup_enabled: false,
        });
    }

    if (pathWithoutQuery === "/subscription/credits/usage") {
        return res({
            spent_today: 12,
            spent_week: 84,
            spent_month: 320,
            limit_daily: null,
            limit_weekly: null,
            limit_monthly: null,
        });
    }

    // 4. Mailboxes / Emails
    const emails = loadStorage("emails", initialEmails);
    if (pathWithoutQuery === "/emails/allowance") {
        return res({
            used: emails.length,
            allowance: null, // unlimited
            remaining: null,
            basis: "unlimited",
            sends_per_mailbox: 50,
            paid: true,
            pending_request: null,
        });
    }

    if (pathWithoutQuery === "/emails/tags") {
        return res([]);
    }

    if (pathWithoutQuery === "/emails") {
        if (method === "POST") {
            const body = typeof config.data === "string" ? JSON.parse(config.data || "{}") : config.data || {};
            const newEmail = {
                id: `eml_${Date.now()}`,
                email: body.email || "new_account@theboredmonkey.com",
                name: body.name || "Outreach Account",
                signature_plain: "Best regards,\nOutreach Team",
                signature_html: "<p>Best regards,<br/>Outreach Team</p>",
                signature_sync: false,
                signature_code: false,
                tags: ["primary"],
                provider: body.provider || "google",
                status: "active",
                last_synced_at: new Date().toISOString(),
                campaign_limit: 50,
                min_wait_time: 3,
                reply_to: "",
                save_to_sent: false,
                tracking_domain: "mail.theboredmonkey.com",
                tracking_domain_verified: true,
                tracking_domain_verified_at: new Date().toISOString(),
                auth_state: "passing",
                auth_spf: true,
                auth_dkim: true,
                auth_dmarc: true,
                warmup: new Date().toISOString(),
                warmup_paused_at: null,
                warmup_base: 5,
                warmup_max: 50,
                warmup_increase: 3,
                warmup_reply_rate: 35,
                reputation: 99,
                daily_limit: 50,
                sent_today: 0,
                total_sent: 0,
                mailbox_allowance: 50,
                connected_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            emails.unshift(newEmail);
            saveStorage("emails", emails);
            return res(newEmail);
        }
        return res({
            data: emails,
            pagination: {
                total: emails.length,
                next_cursor: null,
                has_more: false,
            },
        });
    }

    if (pathWithoutQuery.startsWith("/emails/")) {
        const id = pathWithoutQuery.replace("/emails/", "");
        if (id.endsWith("/auth-check")) {
            return res({ passing: true, spf: true, dkim: true, dmarc: true, reason: null, checked_at: new Date().toISOString() });
        }
        if (id.endsWith("/behavior")) {
            return res({ daily_limit: 50, min_wait_time: 3, reply_to: "", save_to_sent: false });
        }
        if (id.endsWith("/sending-plan")) {
            return res({ daily_limit: 50, warmup_base: 5, warmup_max: 50, warmup_increase: 3 });
        }
        if (id.endsWith("/warmup/ban-status")) {
            return res({ banned: false, can_appeal: false, reason: null });
        }
        if (id.endsWith("/track")) {
            return res({ domain: "mail.theboredmonkey.com", verified: true, verified_at: new Date().toISOString() });
        }
        if (id.endsWith("/sync")) {
            return res({ status: "synced", last_synced_at: new Date().toISOString() });
        }
        const pureId = id.split("/")[0];
        const match = emails.find((e: { id: string }) => e.id === pureId) || emails[0];
        return res(match);
    }

    // 5. Campaigns
    const campaigns = loadStorage("campaigns", initialCampaigns);
    if (pathWithoutQuery === "/campaigns") {
        if (method === "POST") {
            const body = typeof config.data === "string" ? JSON.parse(config.data || "{}") : config.data || {};
            const newCamp = {
                id: `cmp_${Date.now()}`,
                name: body.name || "New Outreach Campaign",
                description: "Outreach sequence",
                status: "draft",
                kind: "sequence",
                stop_on_reply: true,
                open_tracking: true,
                link_tracking: true,
                utm_tracking: false,
                text_only: false,
                daily_limit: 50,
                unsubscribe_header: true,
                risky_emails: false,
                cc: [],
                bcc: [],
                start_date: new Date().toISOString(),
                end_date: null,
                timezone: "UTC",
                days: 127,
                start_time: "09:00",
                end_time: "18:00",
                email_tags: [],
                folders: [],
                total_leads: 0,
                sent_count: 0,
                open_count: 0,
                reply_count: 0,
                bounce_count: 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                mailboxes: emails.slice(0, 1).map((e: { id: string }) => e.id),
                steps: [],
                sequences: [],
                analytics: null,
            };
            campaigns.unshift(newCamp as any);
            saveStorage("campaigns", campaigns);
            return res(newCamp);
        }
        return res({
            data: campaigns,
            count: campaigns.length,
            pagination: {
                total: campaigns.length,
                next_cursor: null,
                has_more: false,
            },
        });
    }

    if (pathWithoutQuery.startsWith("/campaigns/")) {
        const parts = pathWithoutQuery.split("/").filter(Boolean);
        const campId = parts[1];
        const sub = parts[2];
        const match = campaigns.find((c: { id: string }) => c.id === campId) || campaigns[0];

        if (sub === "steps" || sub === "sequences") {
            return res(match?.steps ?? match?.sequences ?? []);
        }
        if (sub === "leads") {
            const campLeads = initialContacts.filter((ct: { campaign_id?: string }) => ct.campaign_id === campId);
            const results = campLeads.length > 0 ? campLeads : initialContacts.slice(0, 5);
            return res({ data: results, total: results.length, pagination: { total: results.length, has_more: false, next_cursor: null } });
        }
        if (sub === "senders") {
            return res({
                data: emails.map((e: { id: string }) => ({
                    email_account_id: e.id,
                    weight: 100,
                    enabled: true,
                    last_sent_at: null,
                })),
            });
        }
        return res(match);
    }

    // 6. Contacts
    const contacts = loadStorage("contacts", initialContacts);
    if (pathWithoutQuery === "/contacts" || pathWithoutQuery === "/contacts/search") {
        if (method === "POST" && pathWithoutQuery === "/contacts") {
            const body = typeof config.data === "string" ? JSON.parse(config.data || "{}") : config.data || {};
            const newContact = {
                id: `cnt_${Date.now()}`,
                email: body.email || "contact@example.com",
                first_name: body.first_name || "Lead",
                last_name: body.last_name || "",
                company_name: body.company_name || "",
                title: body.title || "",
                status: "new",
                tags: body.tags || [],
                custom_fields: {},
                created_at: new Date().toISOString(),
            };
            contacts.unshift(newContact as any);
            saveStorage("contacts", contacts);
            return res(newContact);
        }
        return res({
            data: contacts,
            pagination: {
                total: contacts.length,
                page: 1,
                limit: 50,
                next_cursor: null,
                has_more: false,
            },
        });
    }

    if (pathWithoutQuery === "/contacts/segments") {
        return res([
            { id: "seg_1", name: "High-Intent Founders", count: 128 },
            { id: "seg_2", name: "VP Sales / CRO", count: 86 },
        ]);
    }

    if (pathWithoutQuery === "/contacts/categories") {
        return res([
            { id: "cat_1", name: "SaaS & Tech", count: 184 },
            { id: "cat_2", name: "FinTech", count: 92 },
        ]);
    }

    if (pathWithoutQuery === "/contacts/custom-fields") {
        return res({ data: ["company", "title", "industry", "source", "phone", "website"] });
    }

    if (pathWithoutQuery === "/contacts/suppressions") {
        return res({ data: [], pagination: { has_more: false, next_cursor: null } });
    }

    // 7. Unibox (Unified Inbox)
    if (pathWithoutQuery === "/unibox" || pathWithoutQuery === "/unibox/overview") {
        const uniboxRows = [
            {
                id: "msg_1",
                email_id: emails[0]?.id || "eml_1",
                thread_id: "th_1",
                from_addr: ["Sarah Chen <sarah.chen@fintechlabs.com>"],
                to_addr: [emails[0]?.email || "haji.karim@theboredmonkey.com"],
                subject: "Re: Quick question about SaaS scaling",
                snippet: "Thanks Haji, this looks really interesting. Do you have 15 mins tomorrow at 2 PM?",
                internal_date: "2026-03-10T15:24:00Z",
                seen: false,
                message_count: 2,
                has_unread: true,
                labels: [{ id: "cat_1", title: "Interested", color: "#10b981" }],
            },
            {
                id: "msg_2",
                email_id: emails[0]?.id || "eml_1",
                thread_id: "th_2",
                from_addr: ["Marcus Vance <marcus.v@cloudscale.net>"],
                to_addr: [emails[0]?.email || "haji.karim@theboredmonkey.com"],
                subject: "Re: Partnership opportunity with TheBoredMonkey",
                snippet: "Can you send over the technical documentation for deliverability warmup?",
                internal_date: "2026-03-11T09:12:00Z",
                seen: true,
                message_count: 2,
                has_unread: false,
                labels: [{ id: "cat_2", title: "Follow Up", color: "#3b82f6" }],
            },
        ];
        return res({
            data: uniboxRows,
            pagination: {
                has_more: false,
                next_cursor: null,
            },
        });
    }

    // 8. Analytics & Deliverability
    if (pathWithoutQuery === "/analytics/accounts") {
        return res(
            emails.map((e: { id: string; email: string; reputation?: number }) => ({
                id: e.id,
                email: e.email,
                health: {
                    status: "healthy",
                    score: e.reputation || 98,
                    issues: [],
                },
                warmup_health: {
                    status: "healthy",
                    reason: null,
                },
            }))
        );
    }

    if (pathWithoutQuery.startsWith("/advisor/")) {
        return res({
            findings: [],
            summary: { total: 0, critical: 0, warning: 0 },
        });
    }

    if (pathWithoutQuery.startsWith("/analytics/campaigns/") && pathWithoutQuery.endsWith("/daily")) {
        const dates = ["2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10", "2026-03-11"];
        const dailyData = dates.map((d, i) => ({
            date: d,
            sent: 10 + i * 4,
            opens: 7 + i * 3,
            clicks: 2 + i,
            replies: i === 5 || i === 6 ? 2 : 1,
        }));
        return res({ data: dailyData });
    }

    if (pathWithoutQuery.startsWith("/analytics/campaigns/")) {
        const campId = pathWithoutQuery.replace("/analytics/campaigns/", "").split("/")[0];
        const match = campaigns.find((c: { id: string }) => c.id === campId) || campaigns[0];
        return res({
            campaign_id: match.id,
            name: match.name,
            status: match.status,
            date_range: { from: "2026-03-01", to: "2026-03-11" },
            summary: {
                total_contacts: match.total_leads || 21,
                emails_sent: match.sent_count || 34,
                emails_pending: 0,
                unique_opens: match.open_count || 22,
                machine_opens: 2,
                machine_clicks: 0,
                unique_clicks: 6,
                replies: match.reply_count || 5,
                bounces: 0,
                unsubscribes: 0,
                open_rate: 64.7,
                click_rate: 17.6,
                reply_rate: 14.7,
                bounce_rate: 0,
            },
            steps: (match.steps || []).map((s: { id: string; stepNumber?: number; position?: number; subject: string }) => ({
                step_id: s.id,
                name: `Step ${s.stepNumber || s.position || 1}`,
                position: s.stepNumber || s.position || 1,
                emails_sent: 17,
                opens: 11,
                clicks: 3,
                replies: 2,
                bounces: 0,
            })),
            daily_stats: [],
            engagement: {
                countries: [{ key: "IN", opens: 14, clicks: 4 }, { key: "US", opens: 8, clicks: 2 }],
                clients: [{ key: "Gmail", opens: 18, clicks: 5 }, { key: "Apple Mail", opens: 4, clicks: 1 }],
                devices: [{ key: "Desktop", opens: 16, clicks: 4 }, { key: "Mobile", opens: 6, clicks: 2 }],
            },
        });
    }

    if (pathWithoutQuery === "/analytics/dashboard" || pathWithoutQuery === "/analytics") {
        return res({
            sent: 1250,
            delivered: 1244,
            opens: 812,
            replies: 158,
            bounces: 6,
            open_rate: 65.2,
            reply_rate: 12.7,
            bounce_rate: 0.48,
            deliverability_score: 99.5,
        });
    }

    if (pathWithoutQuery === "/analytics/daily") {
        const dates = ["2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10", "2026-03-11"];
        return res({
            data: dates.map((d, i) => ({
                date: d,
                sent: 40 + i * 15,
                opens: 28 + i * 10,
                clicks: 8 + i * 2,
                replies: 4 + i,
            })),
        });
    }

    if (pathWithoutQuery === "/analytics/deliverability") {
        return res({
            score: 99.2,
            spf: "pass",
            dkim: "pass",
            dmarc: "pass",
            placement_inbox: 99.1,
            placement_spam: 0.9,
            spam_rescued: 14,
        });
    }

    // 9. CRM: Pipelines, Deals, Tasks, Meetings
    if (pathWithoutQuery === "/crm/pipelines" || pathWithoutQuery === "/pipelines") {
        return res([
            {
                id: "pipe_1",
                name: "Outreach Deal Flow",
                stages: [
                    { id: "stg_1", name: "Lead In", deals_count: 12 },
                    { id: "stg_2", name: "Interested", deals_count: 8 },
                    { id: "stg_3", name: "Demo Booked", deals_count: 5 },
                    { id: "stg_4", name: "Proposal", deals_count: 3 },
                    { id: "stg_5", name: "Closed Won", deals_count: 7 },
                ],
            },
        ]);
    }

    const defaultDeals = [
        { id: "dl_1", title: "HyperGrowth - Enterprise Expansion", value: 18000, stage: "Demo Booked", contact_name: "Alex Riviera", created_at: "2026-03-01T10:00:00Z" },
        { id: "dl_2", title: "FinTech Labs - Pilot Program", value: 12000, stage: "Interested", contact_name: "Sarah Chen", created_at: "2026-03-04T12:00:00Z" },
    ];

    if (pathWithoutQuery === "/crm/deals/search" || pathWithoutQuery === "/crm/deals" || pathWithoutQuery === "/deals") {
        return res({
            data: defaultDeals,
            pagination: {
                total: defaultDeals.length,
                has_more: false,
                next_cursor: null,
            },
        });
    }

    const defaultTasks = [
        { id: "tsk_1", title: "Follow up with Sarah Chen on Demo slot", due_date: "2026-03-12T14:00:00Z", completed: false, created_at: "2026-03-08T10:00:00Z" },
        { id: "tsk_2", title: "Review mailbox reputation metrics for sales@", due_date: "2026-03-13T10:00:00Z", completed: false, created_at: "2026-03-09T10:00:00Z" },
    ];

    if (pathWithoutQuery === "/crm/tasks/search" || pathWithoutQuery === "/crm/tasks" || pathWithoutQuery === "/tasks" || pathWithoutQuery === "/crm/tasks/summary") {
        return res({
            data: defaultTasks,
            total: defaultTasks.length,
            pending: defaultTasks.filter(t => !t.completed).length,
            pagination: {
                total: defaultTasks.length,
                has_more: false,
                next_cursor: null,
            },
        });
    }

    const defaultMeetings = [
        { id: "mtg_1", title: "TheBoredMonkey Demo & Walkthrough", attendee: "sarah.chen@fintechlabs.com", scheduled_at: "2026-03-12T14:00:00Z" },
    ];

    if (pathWithoutQuery === "/meetings" || pathWithoutQuery === "/crm/meetings" || pathWithoutQuery === "/meetings/summary") {
        return res({
            data: defaultMeetings,
            total: defaultMeetings.length,
            pagination: {
                total: defaultMeetings.length,
                has_more: false,
                next_cursor: null,
            },
        });
    }

    // 10. Templates & General
    const defaultTemplates = [
        {
            id: "tmpl_1",
            organization_id: "org_tbm_main",
            user_id: "usr_tbm_haji",
            name: "Direct Value Pitch",
            subject: "Quick question on {{company}}",
            body_html: "<p>Hi {{firstName}},</p><p>Loved your recent launch and wanted to connect...</p>",
            body_plain: "Hi {{firstName}},\n\nLoved your recent launch and wanted to connect...",
            position: 1,
            created_at: "2026-03-01T10:00:00Z",
            updated_at: "2026-03-08T10:00:00Z",
        },
        {
            id: "tmpl_2",
            organization_id: "org_tbm_main",
            user_id: "usr_tbm_haji",
            name: "Case Study Proof",
            subject: "How similar companies grew outbound 3x",
            body_html: "<p>Hey {{firstName}},</p><p>Thought this would interest you...</p>",
            body_plain: "Hey {{firstName}},\n\nThought this would interest you...",
            position: 2,
            created_at: "2026-03-02T10:00:00Z",
            updated_at: "2026-03-09T10:00:00Z",
        },
    ];

    if (pathWithoutQuery === "/templates") {
        if (method === "POST") {
            const body = typeof config.data === "string" ? JSON.parse(config.data || "{}") : config.data || {};
            const newTmpl = {
                id: `tmpl_${Date.now()}`,
                organization_id: "org_tbm_main",
                user_id: "usr_tbm_haji",
                name: body.name || "New Template",
                subject: body.subject || "Subject",
                body_html: body.body_html || "<p>Hello</p>",
                body_plain: body.body_plain || "Hello",
                position: 3,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            return res(newTmpl);
        }
        return res({
            data: defaultTemplates,
        });
    }

    if (pathWithoutQuery === "/timezones") {
        return res([
            "UTC",
            "America/New_York",
            "America/Chicago",
            "America/Denver",
            "America/Los_Angeles",
            "Europe/London",
            "Europe/Paris",
            "Asia/Dubai",
            "Asia/Kolkata",
            "Asia/Singapore",
            "Asia/Tokyo",
            "Australia/Sydney",
        ]);
    }

    // 11. Automations (Full CRUD & Execution)
    const initialAutomations = [
        {
            id: "auto_1",
            organization_id: "org_tbm_main",
            name: "Tag hot replies",
            enabled: true,
            trigger_event: "reply.positive",
            graph: {
                nodes: [
                    { id: "trigger", type: "trigger", x: 200, y: 100 },
                    { id: "action_1", type: "action", connection_id: "conn_slack", action: { id: "slack.send_message", name: "Send Slack Alert", provider: "slack" }, x: 200, y: 220 },
                ],
                edges: [{ id: "e1", source: "trigger", target: "action_1", when: "" }],
            },
            created_at: "2026-03-01T10:00:00Z",
            updated_at: "2026-03-08T10:00:00Z",
        },
        {
            id: "auto_2",
            organization_id: "org_tbm_main",
            name: "Deal on meeting booked",
            enabled: true,
            trigger_event: "meeting.booked",
            graph: {
                nodes: [
                    { id: "trigger", type: "trigger", x: 200, y: 100 },
                    { id: "action_1", type: "action", connection_id: "conn_hubspot", action: { id: "hubspot.create_deal", name: "Create Deal", provider: "hubspot" }, x: 200, y: 220 },
                ],
                edges: [{ id: "e1", source: "trigger", target: "action_1", when: "" }],
            },
            created_at: "2026-03-02T10:00:00Z",
            updated_at: "2026-03-09T10:00:00Z",
        },
        {
            id: "auto_3",
            organization_id: "org_tbm_main",
            name: "Unsubscribe on bounce",
            enabled: true,
            trigger_event: "email.bounced",
            graph: {
                nodes: [
                    { id: "trigger", type: "trigger", x: 200, y: 100 },
                    { id: "action_1", type: "action", action: { id: "system.suppress_contact", name: "Suppress Contact", provider: "system" }, x: 200, y: 220 },
                ],
                edges: [{ id: "e1", source: "trigger", target: "action_1", when: "" }],
            },
            created_at: "2026-03-03T10:00:00Z",
            updated_at: "2026-03-10T10:00:00Z",
        },
    ];

    let automations = loadStorage("automations_list", initialAutomations);

    if (pathWithoutQuery === "/automations") {
        if (method === "GET") {
            return res({ automations });
        }
        if (method === "POST") {
            const body = typeof config.data === "string" ? JSON.parse(config.data || "{}") : config.data || {};
            const newAutomation = {
                id: `auto_${Date.now()}`,
                organization_id: "org_tbm_main",
                name: body.name || "New automation",
                enabled: body.enabled ?? false,
                trigger_event: body.trigger_event || "meeting.booked",
                filter: body.filter,
                graph: body.graph || { nodes: [{ id: "trigger", type: "trigger", x: 0, y: 0 }], edges: [] },
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            automations = [newAutomation, ...automations];
            saveStorage("automations_list", automations);
            return res({ automation: newAutomation }, 201);
        }
    }

    if (pathWithoutQuery.startsWith("/automations/")) {
        const parts = pathWithoutQuery.replace("/automations/", "").split("/");
        const autoId = parts[0];
        const subAction = parts[1];

        if (subAction === "test") {
            return res({
                status: "success",
                path: ["trigger", "action_1"],
                previews: [
                    { node_id: "trigger", event: "meeting.booked", payload: { contact: "sarah.chen@fintechlabs.com" } },
                    { node_id: "action_1", status: "simulated_success", output: { deal_id: "dl_simulated_1" } },
                ],
            });
        }

        if (subAction === "runs") {
            return res({ runs: [] });
        }

        const matchIndex = automations.findIndex((a: { id: string }) => a.id === autoId);
        const match = matchIndex >= 0 ? automations[matchIndex] : automations[0];

        if (method === "GET") {
            return res({ automation: match });
        }

        if (method === "PATCH" || method === "PUT") {
            const body = typeof config.data === "string" ? JSON.parse(config.data || "{}") : config.data || {};
            const updated = {
                ...match,
                ...body,
                updated_at: new Date().toISOString(),
            };
            if (matchIndex >= 0) {
                automations[matchIndex] = updated;
            } else {
                automations.push(updated);
            }
            saveStorage("automations_list", automations);
            return res({ automation: updated });
        }

        if (method === "DELETE") {
            automations = automations.filter((a: { id: string }) => a.id !== autoId);
            saveStorage("automations_list", automations);
            return res({ deleted: true });
        }
    }

    // 12. Webhooks & Domains (Smartlead verified integration)
    const smartleadWebhooks = [
        {
            id: "whk_smartlead_01",
            name: "Smartlead Event Relay",
            url: "https://theboredmonkey.com/api/webhooks/smartlead",
            events: ["email.sent", "email.opened", "email.replied", "email.bounced"],
            status: "active",
            verified: true,
            created_at: "2026-03-01T00:00:00Z",
            last_delivery_at: new Date().toISOString(),
            success_rate: 100,
        },
    ];

    if (pathWithoutQuery === "/webhooks" || pathWithoutQuery === "/settings/webhooks") {
        return res({ data: smartleadWebhooks });
    }

    const trackingDomains = [
        {
            id: "dom_tbm_1",
            domain: "mail.theboredmonkey.com",
            cname_target: "custom.smartlead.ai",
            status: "verified",
            ssl_active: true,
            spf_valid: true,
            dkim_valid: true,
            dmarc_valid: true,
            verified_at: "2026-03-01T00:00:00Z",
        },
    ];

    if (pathWithoutQuery === "/domains" || pathWithoutQuery === "/settings/tracking" || pathWithoutQuery === "/settings/sending") {
        return res({
            domains: trackingDomains,
            tracking_domain: "mail.theboredmonkey.com",
            cname_verified: true,
            ssl: true,
        });
    }

    // 13. AI Assistant Sessions & Transcripts
    let aiSessions = loadStorage("ai_sessions_list", [
        {
            id: "sess_welcome",
            org_id: "org_tbm_main",
            user_id: "usr_tbm_haji",
            title: "Outreach Strategy & Campaign Analysis",
            context: { page: "/app/dashboard" },
            created_at: "2026-03-10T10:00:00Z",
            updated_at: "2026-03-11T12:00:00Z",
        },
    ]);

    if (pathWithoutQuery === "/ai/sessions") {
        if (method === "GET") {
            return res({
                data: aiSessions,
                pagination: { next_cursor: null, has_more: false },
            });
        }
        if (method === "POST") {
            const body = typeof config.data === "string" ? JSON.parse(config.data || "{}") : config.data || {};
            const newSession = {
                id: `sess_${Date.now()}`,
                org_id: "org_tbm_main",
                user_id: "usr_tbm_haji",
                title: body.resource || "New Assistant Chat",
                context: body,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            aiSessions = [newSession, ...aiSessions];
            saveStorage("ai_sessions_list", aiSessions);
            return res(newSession, 201);
        }
        if (method === "DELETE") {
            aiSessions = [];
            saveStorage("ai_sessions_list", aiSessions);
            return res({ deleted: true });
        }
    }

    if (pathWithoutQuery.startsWith("/ai/sessions/")) {
        const parts = pathWithoutQuery.replace("/ai/sessions/", "").split("/");
        const sId = parts[0];
        const sub = parts[1];

        if (sub === "messages" && method === "GET") {
            return res({
                title: "Assistant Chat",
                turns: [],
                pending: null,
                free_model: true,
            });
        }

        if (method === "DELETE") {
            aiSessions = aiSessions.filter((s: { id: string }) => s.id !== sId);
            saveStorage("ai_sessions_list", aiSessions);
            return res({ deleted: true });
        }
    }

    // Safe universal fallback for any other route
    return res({
        data: [],
        total: 0,
        status: "ok",
        items: [],
        results: [],
    });
}

export function installStandaloneFetchInterceptor(): void {
    if (typeof window === "undefined" || (window as unknown as { __tbm_mock_installed?: boolean }).__tbm_mock_installed) {
        return;
    }
    (window as unknown as { __tbm_mock_installed?: boolean }).__tbm_mock_installed = true;

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

        // Intercept AI streaming requests (Delegated to server-side /api/chat for environment security)
        if (urlStr.includes("/ai/sessions/") && urlStr.endsWith("/messages") && (init?.method ?? "POST") === "POST") {
            try {
                let bodyObj: { message?: string; text?: string; page?: string; resource?: string; context?: Record<string, unknown> } = {};
                if (typeof init?.body === "string") {
                    try { bodyObj = JSON.parse(init.body); } catch {}
                }

                const userPrompt = (bodyObj.text || bodyObj.message || "").trim();

                try {
                    // Call server-side /api/chat (OpenAI key is protected on the server in environment variables)
                    const serverStreamRes = await originalFetch("/api/chat", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ prompt: userPrompt, page: bodyObj.page, resource: bodyObj.resource }),
                    });

                    if (serverStreamRes.ok && serverStreamRes.body) {
                        return new Response(serverStreamRes.body, {
                            status: 200,
                            headers: {
                                "Content-Type": "text/event-stream; charset=utf-8",
                                "Cache-Control": "no-cache",
                                Connection: "keep-alive",
                            },
                        });
                    }
                } catch (err) {
                    console.warn("Server-side /api/chat error, using fallback telemetry response:", err);
                }

                // Fallback grounded knowledge assistant if server is offline
                let responseContent = "";
                const lower = userPrompt.toLowerCase();

                if (lower.includes("lead") || lower.includes("cold") || lower.includes("follow-up")) {
                    responseContent = `Based on your core workspace telemetry:\n\n- **12 leads** from your older campaigns (Tech Corp & Alpha Digital) haven't engaged in over 7 days.\n- **Campaign 106** is performing strongly with a **70.5% open rate**.\n- Suggested Action: We can trigger a gentle 3-day bump sequence referencing the case study template to re-engage them.\n\n*Tip: To activate live GPT-4o-mini reasoning, type \`/key sk-...\` here.*`;
                } else if (lower.includes("inbox") || lower.includes("repl")) {
                    responseContent = `You have **2 high-priority active conversations** in your Unibox:\n\n1. **Jane Smith** (VP Growth, Fintech Labs): Requested a demo for Thursday 2 PM.\n2. **Michael Chang** (CTO, Cloudscale): Asked for enterprise security and API docs.\n\nBoth mailboxes (\`haji.karim@theboredmonkey.com\` and \`contact@phonepe.business\`) are in optimal deliverability health (99.2% score).`;
                } else if (lower.includes("campaign") || lower.includes("perform")) {
                    responseContent = `Here is your campaign telemetry overview:\n\n- **Active Campaigns**: Campaign 106 & Campaign 108\n- **Total Sent**: 1,250 emails (Delivery rate: 99.5%)\n- **Open Rate**: 65.2% (812 opens)\n- **Reply Rate**: 12.7% (158 replies)\n- **Bounce Rate**: 0.48% (Well below the 2% threshold)\n- **Top Subject Line**: *"Quick question on {{company}} scaling"* (78.4% open rate).`;
                } else {
                    responseContent = `I am your **TheBoredMonkey Outreach AI Assistant** with full visibility across your mailboxes, 7 campaigns, 21 contacts, and Smartlead webhooks.\n\nHow can I help you today? You can ask me to draft a high-converting cold email, analyze deliverability, or review unibox replies.\n\n> 💡 **GPT-4o-mini Integration**: To connect your live GPT-4o-mini key, simply enter \`/key sk-your-key-here\` anytime.`;
                }

                return createSSEResponse([responseContent]);
            } catch (err) {
                console.warn("AI session handler error:", err);
            }
        }
        
        // Only intercept API calls targeting /v1 (and exclude external OpenAI calls)
        if (!urlStr.includes("api.openai.com") && (urlStr.includes("/v1/") || urlStr.startsWith("/v1"))) {
            try {
                const method = init?.method ?? "GET";
                let data: unknown = init?.body;
                if (typeof data === "string") {
                    try { data = JSON.parse(data); } catch {}
                }
                const mockRes = await handleStandaloneRequest({
                    url: urlStr,
                    method,
                    data,
                });
                return new Response(JSON.stringify(mockRes.data), {
                    status: mockRes.status,
                    statusText: mockRes.statusText,
                    headers: { "Content-Type": "application/json" },
                });
            } catch (err) {
                console.warn("Standalone mock fetch error:", err);
            }
        }
        return originalFetch(input, init);
    };
}

function createSSEResponse(messages: string[]): Response {
    return new Response(
        new ReadableStream({
            start(controller) {
                const enc = new TextEncoder();
                // Send text deltas
                for (const msg of messages) {
                    const chunks = msg.match(/.{1,12}/g) || [msg];
                    for (const chunk of chunks) {
                        controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "text_delta", text: chunk })}\n\n`));
                    }
                }
                controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: "done", credits_remaining: 1000 })}\n\n`));
                controller.close();
            },
        }),
        {
            status: 200,
            headers: {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            },
        },
    );
}


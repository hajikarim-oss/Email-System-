import type { ContactsCounts, ContactsRequest, ContactsResponse, LeadCounts, QueryFn } from "./types";

const EMAIL_HANDLERS = new Set([
    "gmail.com", "googlemail.com", "google.com",
    "hotmail.com", "hotmail.co.uk", "hotmail.fr", "hotmail.es", "hotmail.it", "hotmail.de",
    "outlook.com", "outlook.in", "live.com", "msn.com",
    "yahoo.com", "yahoo.co.in", "yahoo.co.uk", "yahoo.fr", "ymail.com",
    "icloud.com", "me.com", "mac.com",
    "aol.com", "zoho.com", "proton.me", "protonmail.com", "rediffmail.com", "gmx.com", "mail.com",
]);

const SELECT_COLUMNS = `
    id, email, "firstName", "lastName", domain, "customData", status, "outreachState",
    "recencyBucket", "daysSinceLastContact", "firstContactedAt", "lastContactedAt",
    "lastSubject", "lastBodyHook", "lastSender", "lastCampaign", "lastOutcome", "lastMessageId",
    "totalMessages", "totalReplied", "totalOutbound", "openCount", "clickCount",
    "campaignId", "leadCategory", "createdAt", "updatedAt"
`;

interface Where {
    sql: string;
    params: unknown[];
}

function buildWhere(req: ContactsRequest): Where {
    const params: unknown[] = [];
    const push = (value: unknown) => {
        params.push(value);
        return `$${params.length}`;
    };
    const conds: string[] = [];

    const campaignIds = (req.campaignIds || []).map(String).filter(Boolean);
    if (campaignIds.length > 0) {
        const placeholders = campaignIds.map((id) => push(id));
        conds.push(`"campaignId" IN (${placeholders.join(", ")})`);
    }

    const search = (req.query || "").trim();
    if (search) {
        const like = push(`%${search}%`);
        conds.push(`(
            "email" ILIKE ${like}
            OR "firstName" ILIKE ${like}
            OR "lastName" ILIKE ${like}
            OR "domain" ILIKE ${like}
            OR lower(coalesce("firstName", '') || ' ' || coalesce("lastName", '')) ILIKE ${like}
            OR lower(coalesce("customData"->>'company', '') || ' ' || coalesce("customData"->>'company_name', '')) ILIKE ${like}
        )`);
    }

    const company = (req.company || "").trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "");
    if (company) {
        const like = push(`%${company}%`);
        const mailLike = push(`%@${company}%`);
        conds.push(`(
            "domain" ILIKE ${like}
            OR "email" ILIKE ${mailLike}
            OR lower(coalesce("customData"->>'company', '')) ILIKE ${like}
            OR lower(coalesce("customData"->>'company_name', '')) ILIKE ${like}
        )`);
    }

    const domain = (req.domain || "").trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, "");
    if (domain) {
        const like = push(`%${domain}%`);
        const mailLike = push(`%@${domain}%`);
        conds.push(`("domain" ILIKE ${like} OR "email" ILIKE ${mailLike})`);
    }

    if (req.outreachState && req.outreachState !== "all") {
        conds.push(`"outreachState" = ${push(req.outreachState)}`);
    }

    if (req.recencyBucket && req.recencyBucket !== "all") {
        conds.push(`"recencyBucket" = ${push(req.recencyBucket)}`);
    }

    if (req.subscribed === true) {
        conds.push(`status NOT IN ('UNSUBSCRIBED', 'BOUNCED') AND "outreachState" <> 'BURNED'`);
    } else if (req.subscribed === false) {
        conds.push(`(status IN ('UNSUBSCRIBED', 'BOUNCED') OR "outreachState" = 'BURNED')`);
    }

    return { sql: conds.length ? `WHERE ${conds.join(" AND ")}` : "", params };
}

function parseJson(value: unknown): Record<string, any> {
    if (!value) return {};
    if (typeof value === "string") {
        try {
            return JSON.parse(value);
        } catch {
            return {};
        }
    }
    if (typeof value === "object") return value as Record<string, any>;
    return {};
}

function mapLead(l: any, campaignScoped: boolean) {
    const rawDomain = (l.domain || (l.email ? String(l.email).split("@")[1] : "") || "").toLowerCase().trim();
    const isHandler = EMAIL_HANDLERS.has(rawDomain);
    const custom = parseJson(l.customData);

    let companyName = "";
    const customCompany =
        typeof custom.company === "string" && !EMAIL_HANDLERS.has(custom.company.toLowerCase().trim())
            ? custom.company
            : typeof custom.company_name === "string" && !EMAIL_HANDLERS.has(custom.company_name.toLowerCase().trim())
              ? custom.company_name
              : "";

    if (customCompany) {
        companyName = customCompany.trim();
    } else if (!isHandler && rawDomain) {
        companyName = rawDomain.charAt(0).toUpperCase() + rawDomain.slice(1);
    } else if (isHandler) {
        const handlerName = rawDomain.split(".")[0];
        companyName = `Personal Inbox (${handlerName.charAt(0).toUpperCase() + handlerName.slice(1)})`;
    } else {
        companyName = l.firstName ? `${l.firstName}'s Org` : "Direct Contact";
    }

    const isSub = l.status !== "UNSUBSCRIBED" && l.status !== "BOUNCED" && l.outreachState !== "BURNED";
    const daysAgo = l.daysSinceLastContact !== null && l.daysSinceLastContact !== undefined ? `${l.daysSinceLastContact}d ago` : null;
    const isReplied =
        l.status === "REPLIED" || l.outreachState === "DORMANT_REPLIED" || (l.totalReplied && l.totalReplied > 0);
    const isDispatched =
        (l.totalOutbound && l.totalOutbound > 0) || l.lastContactedAt !== null || isReplied || l.status === "COMPLETED";

    const campaignLead = campaignScoped
        ? {
              status: isReplied ? "replied" : isDispatched ? "completed" : "pending",
              sent: isDispatched || isReplied ? 1 : 0,
              opened: l.openCount || (isDispatched ? 1 : 0),
              machine_opened: 0,
              clicked: l.clickCount || 0,
              replied: isReplied ? 1 : 0,
              current_step: isReplied
                  ? "Replied (Sequence Stopped)"
                  : isDispatched
                    ? "Step 1 (Outreach)"
                    : "Ready for delivery",
              sender: l.lastSender || (isDispatched ? l.lastSender || undefined : undefined),
              last_activity_at: l.lastContactedAt || null,
          }
        : undefined;

    const stateLabel = (l.outreachState || "NEVER_REACHED").replace(/_/g, " ");

    return {
        id: l.id,
        first_name: l.firstName || (l.email ? String(l.email).split("@")[0] : "") || "Prospect",
        last_name: l.lastName || "",
        email: l.email,
        company: companyName,
        is_email_handler: isHandler,
        email_handler: isHandler ? rawDomain.split(".")[0].charAt(0).toUpperCase() + rawDomain.split(".")[0].slice(1) : null,
        phone: "",
        custom_fields: custom,
        subscribed: isSub,
        status: isSub ? "active" : "unsubscribed",
        verification_status: isSub ? "valid" : "invalid",
        campaigns: l.campaignId ? [{ id: l.campaignId, name: l.lastCampaign || "Q3 Campaign" }] : [],
        campaign_lead: campaignLead,
        categories: [
            {
                id: l.outreachState || "UNKNOWN",
                title: stateLabel,
                color:
                    l.outreachState === "DORMANT_REPLIED"
                        ? "#10b981"
                        : l.outreachState === "BURNED"
                          ? "#ef4444"
                          : l.outreachState === "WARM_STALE"
                            ? "#f59e0b"
                            : "#8b5cf6",
            },
        ],
        domain: isHandler ? "" : l.domain || rawDomain,
        temporal_state: {
            recency_bucket: l.recencyBucket || "NEVER_CONTACTED",
            outreach_state: l.outreachState || "NEVER_REACHED",
            days_since_last_contact: l.daysSinceLastContact,
            first_contacted_at: l.firstContactedAt,
            last_contacted_at: l.lastContactedAt,
            is_dormant: l.outreachState === "DORMANT_REPLIED",
            is_reengagement_candidate: l.outreachState === "DORMANT_REPLIED" || l.outreachState === "COLD_REENGAGEMENT",
        },
        engagement_state: {
            total_messages: l.totalMessages || (l.lastSubject ? 1 : 0),
            total_replied: l.totalReplied || (l.outreachState === "DORMANT_REPLIED" ? 1 : 0),
            reply_classification: l.lastOutcome || "delivered",
        },
        last_message_context: {
            id: l.lastMessageId || null,
            subject: l.lastSubject || "No prior outreach",
            body_hook: l.lastBodyHook || "No conversation snippet recorded yet.",
            sender: l.lastSender || "vatsal.vadecha@theboredmonkey.com",
            campaign: l.lastCampaign || "Q3 Campaign",
            outcome: l.lastOutcome || "delivered",
            date: l.lastContactedAt || l.createdAt,
        },
        tags: [l.outreachState, daysAgo, l.recencyBucket].filter(Boolean),
        open_count: l.openCount || 0,
        click_count: l.clickCount || 0,
        reply_count: l.totalReplied || 0,
        created_at: l.createdAt,
        updated_at: l.updatedAt,
    };
}

async function readCounts(query: QueryFn): Promise<ContactsCounts> {
    const [facetRows, categoryRows, contactRows] = await Promise.all([
        query(`
            SELECT
                count(*)::int AS total,
                count(*) FILTER (
                    WHERE status NOT IN ('UNSUBSCRIBED', 'BOUNCED') AND "outreachState" <> 'BURNED'
                )::int AS subscribed,
                count(*) FILTER (WHERE "campaignId" IS NOT NULL)::int AS in_campaign
            FROM "Lead"
        `),
        query(`
            SELECT "outreachState" AS category_id, count(*)::int AS count
            FROM "Lead"
            GROUP BY 1
            ORDER BY 2 DESC
        `),
        query(`SELECT count(*) FILTER (WHERE "totalOutbound" > 0)::int AS contacted FROM "Lead"`),
    ]);

    const total = facetRows[0]?.total ?? 0;
    const subscribed = facetRows[0]?.subscribed ?? 0;
    const contacted = contactRows[0]?.contacted ?? 0;

    return {
        total,
        subscribed,
        unsubscribed: Math.max(0, total - subscribed),
        in_campaign: facetRows[0]?.in_campaign ?? 0,
        not_contacted: Math.max(0, total - contacted),
        categories: categoryRows.map((r) => ({ category_id: r.category_id, count: r.count })),
    };
}

async function readLeadCounts(query: QueryFn, campaignIds: string[]): Promise<LeadCounts> {
    const params: unknown[] = [];
    const placeholders = campaignIds.map((id) => {
        params.push(id);
        return `$${params.length}`;
    });
    const scope = `WHERE "campaignId" IN (${placeholders.join(", ")})`;

    const rows = await query(
        `SELECT
            count(*)::int AS total,
            count(*) FILTER (WHERE "totalOutbound" = 0)::int AS queued,
            count(*) FILTER (WHERE "totalOutbound" > 0)::int AS completed,
            count(*) FILTER (WHERE "totalOutbound" > 0)::int AS contacted,
            count(*) FILTER (WHERE "totalReplied" > 0)::int AS replied,
            count(*) FILTER (WHERE status = 'BOUNCED')::int AS bounced,
            count(*) FILTER (WHERE status = 'UNSUBSCRIBED')::int AS unsubscribed,
            count(*) FILTER (WHERE "openCount" > 0)::int AS opened,
            count(*) FILTER (WHERE "clickCount" > 0)::int AS clicked
        FROM "Lead" ${scope}`,
        params,
    );

    const r: Record<string, any> = rows[0] || {};
    return {
        total: r.total || 0,
        queued: r.queued || 0,
        processing: 0,
        completed: r.completed || 0,
        contacted: r.contacted || 0,
        replied: r.replied || 0,
        replied_any: r.replied || 0,
        bounced: r.bounced || 0,
        failed: 0,
        unsubscribed: r.unsubscribed || 0,
        undeliverable: 0,
        opened: r.opened || 0,
        clicked: r.clicked || 0,
    };
}

export async function getContacts(req: ContactsRequest, query: QueryFn): Promise<ContactsResponse> {
    const page = Math.max(1, req.page || 1);
    const limit = Math.min(100, Math.max(1, req.limit || 50));
    const campaignIds = (req.campaignIds || []).map(String).filter(Boolean);
    const campaignScoped = campaignIds.length > 0;

    const where = buildWhere(req);
    const order = campaignScoped
        ? `ORDER BY "lastContactedAt" ASC NULLS LAST, "createdAt" ASC`
        : `ORDER BY "lastContactedAt" DESC NULLS LAST, "createdAt" DESC`;

    const pageParams = [...where.params];
    pageParams.push(limit, (page - 1) * limit);
    const limitPh = `$${pageParams.length - 1}`;
    const offsetPh = `$${pageParams.length}`;

    const [rows, countRows, counts, leadCounts] = await Promise.all([
        query(`SELECT ${SELECT_COLUMNS} FROM "Lead" ${where.sql} ${order} LIMIT ${limitPh} OFFSET ${offsetPh}`, pageParams),
        query(`SELECT count(*)::int AS total FROM "Lead" ${where.sql}`, where.params),
        readCounts(query),
        campaignScoped ? readLeadCounts(query, campaignIds) : Promise.resolve(undefined),
    ]);

    const total = countRows[0]?.total ?? 0;

    return {
        data: rows.map((l) => mapLead(l, campaignScoped)),
        total,
        counts,
        lead_counts: leadCounts,
        pagination: {
            total,
            page,
            limit,
            has_more: page * limit < total,
            next_cursor: page * limit < total ? String(page + 1) : null,
        },
    };
}

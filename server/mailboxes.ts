import type { QueryFn, QueryRow } from "./types";
import { mailboxOwned, type DataScope } from "./scope";

export interface MailboxRow extends QueryRow {
    id: string;
    senderEmail: string;
    provider: string | null;
    status: string;
    dailySendLimit: number;
    warmupReputationScore: number | null;
    sent_today: number;
    total_sent: number;
}

export async function getMailboxes(query: QueryFn, scope: DataScope): Promise<MailboxRow[]> {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");

    return query<MailboxRow>(
        `WITH active_mailboxes AS (
            SELECT lower("senderEmail") AS email
            FROM "Mailbox"
            WHERE status != 'RETIRED' AND "senderEmail" IS NOT NULL
        ),
        sends AS (
            SELECT lower("senderEmail") AS email,
                   count(*)::int AS total_sent,
                   count(*) FILTER (WHERE "createdAt" >= $1::timestamp)::int AS sent_today
            FROM "EmailMessage"
            WHERE "senderEmail" IS NOT NULL
              AND lower("senderEmail") IN (SELECT email FROM active_mailboxes)
            GROUP BY 1
            UNION ALL
            SELECT lower("fromEmail") AS email,
                   count(*)::int AS total_sent,
                   count(*) FILTER (WHERE "createdAt" >= $1::timestamp)::int AS sent_today
            FROM "EmailEvent"
            WHERE "eventType" = 'sent'
              AND "fromEmail" IS NOT NULL
              AND lower("fromEmail") IN (SELECT email FROM active_mailboxes)
            GROUP BY 1
            UNION ALL
            SELECT lower(m_assigned."senderEmail") AS email,
                   count(*)::int AS total_sent,
                   count(*) FILTER (WHERE e."createdAt" >= $1::timestamp)::int AS sent_today
            FROM "EmailEvent" e
            JOIN "Lead" l ON l.id = e."leadId"
            JOIN LATERAL (
                SELECT mb."senderEmail"
                FROM "CampaignMailbox" cm
                JOIN "Mailbox" mb ON mb.id = cm."mailboxId"
                WHERE cm."campaignId" = l."campaignId" AND mb.status != 'RETIRED'
                ORDER BY mb."createdAt" ASC
                LIMIT 1
            ) m_assigned ON TRUE
            WHERE e."eventType" = 'sent'
              AND e."fromEmail" IS NULL
            GROUP BY 1
        ),
        totals AS (
            SELECT email,
                   sum(total_sent)::int AS total_sent,
                   sum(sent_today)::int AS sent_today
            FROM sends
            GROUP BY 1
        )
        SELECT
            m."id" AS id,
            m."senderEmail" AS "senderEmail",
            m."provider" AS provider,
            m."status" AS status,
            m."dailySendLimit" AS "dailySendLimit",
            m."warmupReputationScore" AS "warmupReputationScore",
            coalesce(totals.sent_today, 0)::int AS sent_today,
            coalesce(totals.total_sent, 0)::int AS total_sent
         FROM "Mailbox" m
         LEFT JOIN totals ON totals.email = lower(m."senderEmail")
         WHERE m.status != 'RETIRED' AND ${mailboxOwned(scope, "m")}
         ORDER BY m."createdAt" ASC`,
        [todayStart],
    );
}

import type { QueryFn, QueryRow } from "./types";
import { ownerOwned, type DataScope } from "./scope";

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

// Mailboxes with their real send counters. Sends are counted from the mail log
// (EmailMessage.senderEmail) plus the webhook sends recorded on EmailEvent —
// both are database rows, so a mailbox with no recorded sends reports 0 instead
// of a seeded fixture number. "Today" means the current UTC day, matching the
// naive UTC timestamps on those columns.
export async function getMailboxes(query: QueryFn, scope: DataScope): Promise<MailboxRow[]> {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");

    return query<MailboxRow>(
        `WITH sends AS (
            SELECT lower("senderEmail") AS email,
                   count(*)::int AS total_sent,
                   count(*) FILTER (WHERE "createdAt" >= $1::timestamp)::int AS sent_today
            FROM "EmailMessage"
            WHERE "senderEmail" IS NOT NULL
            GROUP BY 1
            UNION ALL
            SELECT lower("fromEmail") AS email,
                   count(*)::int AS total_sent,
                   count(*) FILTER (WHERE "createdAt" >= $1::timestamp)::int AS sent_today
            FROM "EmailEvent"
            WHERE "eventType" = 'sent' AND "fromEmail" IS NOT NULL
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
         WHERE ${ownerOwned(scope, `m."userId"`)}
         ORDER BY m."createdAt" ASC`,
        [todayStart],
    );
}

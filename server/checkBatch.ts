import { pgQuery } from "./pg";

export interface DuplicateContact {
    email: string;
    name: string;
    outreachState: string | null;
    daysSinceLastContact: number | null;
    lastSubject: string | null;
    lastMessage: string | null;
    lastCampaign: string | null;
    campaigns: string[];
    quarantined: boolean;
    quarantineReason?: string;
    hasSent: boolean;
    sentStatus: "SENT" | "NOT_SENT";
    totalOutbound: number;
    lastContactedAt: string | null;
}

export interface QuarantinedContact {
    email: string;
    name: string;
    reason: string;
    quarantined: true;
}

export interface CheckBatchResult {
    duplicates: DuplicateContact[];
    quarantined: QuarantinedContact[];
}

export async function checkBatch(emailsInput: string[]): Promise<CheckBatchResult> {
    const emails = [...new Set(emailsInput.map((e) => (e || "").toLowerCase().trim()).filter(Boolean))];
    if (emails.length === 0) {
        return { duplicates: [], quarantined: [] };
    }

    // 1. Fetch suppressions, leads, and messages in parallel
    const [suppressedList, leads, messages] = await Promise.all([
        pgQuery<{ email: string; reason: string }>(
            `SELECT email, reason FROM "SuppressedEmail" WHERE LOWER(email) = ANY($1::text[])`,
            [emails]
        ).catch(() => []),

        pgQuery<{
            id: string;
            email: string;
            firstName: string | null;
            lastName: string | null;
            outreachState: string | null;
            daysSinceLastContact: number | null;
            lastSubject: string | null;
            lastBodyHook: string | null;
            lastCampaign: string | null;
            totalOutbound: number | null;
            lastStepSent: number | null;
            lastContactedAt: string | null;
            isBurned: boolean | null;
            status: string | null;
            updatedAt: string | null;
            campaignName?: string | null;
        }>(
            `SELECT l.id, l.email, l."firstName", l."lastName", l."outreachState",
                    l."daysSinceLastContact", l."lastSubject", l."lastBodyHook",
                    l."lastCampaign", l."totalOutbound", l."lastStepSent",
                    l."lastContactedAt", l."isBurned", l.status, l."updatedAt",
                    c.name as "campaignName"
             FROM "Lead" l
             LEFT JOIN "Campaign" c ON c.id = l."campaignId"
             WHERE LOWER(l.email) = ANY($1::text[])
             ORDER BY l."lastContactedAt" DESC NULLS LAST, l."updatedAt" DESC`,
            [emails]
        ).catch(() => []),

        pgQuery<{
            contactEmail: string;
            subjectRaw: string | null;
            bodyHook: string | null;
            campaignClean: string | null;
            campaignRaw: string | null;
            direction: string | null;
            createdAt: string | null;
        }>(
            `SELECT "contactEmail", "subjectRaw", "bodyHook", "campaignClean", "campaignRaw", direction, "createdAt"
             FROM "EmailMessage"
             WHERE LOWER("contactEmail") = ANY($1::text[])
             ORDER BY "createdAt" DESC`,
            [emails]
        ).catch(() => []),
    ]);

    const suppressedMap = new Map<string, string>();
    for (const s of suppressedList) {
        suppressedMap.set(s.email.toLowerCase(), s.reason);
    }

    const leadsByEmail = new Map<string, any[]>();
    for (const l of leads) {
        const em = l.email.toLowerCase();
        if (!leadsByEmail.has(em)) leadsByEmail.set(em, []);
        leadsByEmail.get(em)!.push(l);
    }

    const msgsByEmail = new Map<string, any[]>();
    for (const m of messages) {
        const em = (m.contactEmail || "").toLowerCase();
        if (!msgsByEmail.has(em)) msgsByEmail.set(em, []);
        msgsByEmail.get(em)!.push(m);
    }

    const duplicates: DuplicateContact[] = [];
    const quarantined: QuarantinedContact[] = [];

    for (const email of emails) {
        const suppReason = suppressedMap.get(email);
        const emailLeads = leadsByEmail.get(email) || [];
        const emailMsgs = msgsByEmail.get(email) || [];

        const isBurnedOrSupp =
            suppReason ||
            emailLeads.some(
                (l) => l.isBurned || l.status === "UNSUBSCRIBED" || l.status === "BOUNCED"
            );

        if (isBurnedOrSupp) {
            quarantined.push({
                email,
                name: emailLeads[0]
                    ? `${emailLeads[0].firstName || ""} ${emailLeads[0].lastName || ""}`.trim() || email
                    : email,
                reason:
                    suppReason ||
                    (emailLeads.find((l) => l.status === "BOUNCED")
                        ? "Email bounced previously"
                        : emailLeads.find((l) => l.status === "UNSUBSCRIBED")
                        ? "Unsubscribed from outreach"
                        : "Marked as burned"),
                quarantined: true,
            });
            continue;
        }

        if (emailLeads.length === 0 && emailMsgs.length === 0) {
            continue;
        }

        const campaignNames = [
            ...new Set([
                ...emailLeads.map((l) => l.campaignName || l.lastCampaign).filter(Boolean),
                ...emailMsgs.map((m) => m.campaignClean || m.campaignRaw).filter(Boolean),
            ]),
        ];

        const leadWithSubject = emailLeads.find(
            (l) => l.lastSubject && l.lastSubject !== "No prior outreach"
        );
        const leadWithMessage = emailLeads.find(
            (l) => l.lastBodyHook && !l.lastBodyHook.includes("No conversation")
        );
        const leadWithDays = emailLeads.find((l) => l.daysSinceLastContact != null);
        const leadWithState = emailLeads.find(
            (l) =>
                l.outreachState &&
                !["UNKNOWN", "NEVER_REACHED", "NEVER_CONTACTED"].includes(l.outreachState)
        );

        const msgWithSubject = emailMsgs.find((m) => m.subjectRaw);
        const msgWithBody = emailMsgs.find((m) => m.bodyHook);

        const subject = leadWithSubject?.lastSubject || msgWithSubject?.subjectRaw || null;
        const message = leadWithMessage?.lastBodyHook || msgWithBody?.bodyHook || null;

        let daysSince = leadWithDays?.daysSinceLastContact ?? null;
        if (daysSince == null && emailMsgs[0]?.createdAt) {
            daysSince = Math.floor(
                (Date.now() - new Date(emailMsgs[0].createdAt).getTime()) / (1000 * 60 * 60 * 24)
            );
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

        // Exact determination of whether an email has actually been sent to this contact
        const totalOutbound = Math.max(
            ...emailLeads.map((l) => Number(l.totalOutbound) || 0),
            emailMsgs.filter((m) => (m.direction || "").toLowerCase() === "outbound").length,
            0
        );
        const lastStepSent = Math.max(...emailLeads.map((l) => Number(l.lastStepSent) || 0), 0);
        const lastContactedAt =
            emailLeads.find((l) => l.lastContactedAt)?.lastContactedAt ||
            emailMsgs[0]?.createdAt ||
            null;

        const hasSent = Boolean(
            totalOutbound > 0 ||
            lastStepSent > 0 ||
            lastContactedAt != null ||
            emailMsgs.length > 0
        );

        const hasHistory =
            campaignNames.length > 0 ||
            subject != null ||
            message != null ||
            daysSince != null ||
            hasSent ||
            (outreachState && outreachState !== "NEVER_REACHED");

        if (hasHistory) {
            const bestLead = emailLeads[0];
            duplicates.push({
                email,
                name: bestLead
                    ? `${bestLead.firstName || ""} ${bestLead.lastName || ""}`.trim() || email
                    : email,
                outreachState,
                daysSinceLastContact: daysSince,
                lastSubject: subject,
                lastMessage: message,
                lastCampaign: campaignNames[0] || null,
                campaigns: campaignNames,
                quarantined: false,
                hasSent,
                sentStatus: hasSent ? "SENT" : "NOT_SENT",
                totalOutbound,
                lastContactedAt: lastContactedAt ? new Date(lastContactedAt).toISOString() : null,
            });
        }
    }

    return { duplicates, quarantined };
}

export async function checkContact(cleanEmail: string) {
    const res = await checkBatch([cleanEmail]);
    if (res.quarantined.length > 0) {
        return {
            isQuarantined: true,
            reason: res.quarantined[0].reason,
            error: `Quarantine Alert: ${cleanEmail} is on the suppression list (${res.quarantined[0].reason}). Cannot add to active outreach.`,
        };
    }
    if (res.duplicates.length > 0) {
        const d = res.duplicates[0];
        return {
            isDuplicate: true,
            existingContact: {
                name: d.name,
                email: d.email,
                outreachState: d.outreachState,
                daysSinceLastContact: d.daysSinceLastContact,
                lastSubject: d.lastSubject,
                lastMessage: d.lastMessage,
                lastCampaign: d.lastCampaign,
                hasSent: d.hasSent,
                sentStatus: d.sentStatus,
            },
        };
    }
    return { isDuplicate: false, isQuarantined: false };
}

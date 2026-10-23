// Row-level data scoping for the multi-workspace / multi-tenant team architecture.
//
// A MASTER user sees all rows belonging to their active workspace / team.
// A TEAM_MEMBER sees rows created by members of their team or themselves.
//
// Ownership reaches every table through one of four shapes:
//   Campaign.userId / Mailbox.userId  — direct owner column
//   Lead                              — via its Campaign's owner
//   EmailEvent                        — via lead -> Campaign's owner
//   EmailMessage                      — via the sending mailbox's owner
//                                        (the row carries no lead or user link)

export interface DataScope {
    userId: string;
    master: boolean;
    teamId?: string;
    isTroops?: boolean;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function lit(id: string): string {
    return SAFE_ID.test(id) ? `'${id}'` : `''`;
}

export function scopeFor(user: { id: string; role: string; teamId?: string; email?: string }): DataScope {
    const isTroops = Boolean(
        user.id?.startsWith("usr_troops_") ||
        user.teamId === "team_troops_outreach" ||
        (user.email && (user.email.endsWith("@tbmtroop.com") || user.email.includes("troops")))
    );
    return {
        userId: user.id,
        master: user.role === "MASTER",
        teamId: user.teamId,
        isTroops,
    };
}

/** Key fragment for memo/cache keys so cached payloads never cross users or workspaces. */
export function scopeKey(scope: DataScope): string {
    return scope.master ? `master_${scope.userId}` : scope.userId;
}

/** Subquery matching all user IDs in the same team as the scoped user. */
function teamUsersSubquery(userId: string): string {
    return `(
        SELECT ut."userId" 
        FROM "UserTeam" ut 
        WHERE ut."teamId" IN (
            SELECT "teamId" FROM "UserTeam" WHERE "userId" = ${lit(userId)}
        )
        UNION ALL
        SELECT ${lit(userId)}
    )`;
}

/** Direct owner column: `column` defaults to the bare "userId" of the FROM. */
export function ownerOwned(scope: DataScope, column = `"userId"`): string {
    const isTroops = Boolean(scope.userId?.startsWith("usr_troops_") || scope.teamId === "team_troops_outreach");
    if (scope.master && !isTroops) {
        return "TRUE";
    }
    if (scope.master) {
        return `${column} IN ${teamUsersSubquery(scope.userId)}`;
    }
    return `${column} = ${lit(scope.userId)}`;
}

/** Lead rows owned through their campaign. `alias` is the Lead alias or table name. */
export function leadOwned(scope: DataScope, alias = "l"): string {
    const isTroops = Boolean(scope.userId?.startsWith("usr_troops_") || scope.teamId === "team_troops_outreach");
    if (scope.master && !isTroops) {
        return "TRUE";
    }
    if (scope.master) {
        return `(${alias}."campaignId" IS NULL OR EXISTS (SELECT 1 FROM "Campaign" sc WHERE sc.id = ${alias}."campaignId" AND sc."userId" IN ${teamUsersSubquery(scope.userId)}))`;
    }
    return `EXISTS (SELECT 1 FROM "Campaign" sc WHERE sc.id = ${alias}."campaignId" AND sc."userId" = ${lit(scope.userId)})`;
}

/** EmailEvent rows owned through lead -> campaign. `alias` is the event alias. */
export function eventOwned(scope: DataScope, alias = "e"): string {
    const isTroops = Boolean(scope.userId?.startsWith("usr_troops_") || scope.teamId === "team_troops_outreach");
    if (scope.master && !isTroops) {
        return "TRUE";
    }
    if (scope.master) {
        return `EXISTS (SELECT 1 FROM "Lead" sl LEFT JOIN "Campaign" sc ON sc.id = sl."campaignId" WHERE sl.id = ${alias}."leadId" AND (sc."userId" IS NULL OR sc."userId" IN ${teamUsersSubquery(scope.userId)}))`;
    }
    return `EXISTS (SELECT 1 FROM "Lead" sl JOIN "Campaign" sc ON sc.id = sl."campaignId" WHERE sl.id = ${alias}."leadId" AND sc."userId" = ${lit(scope.userId)})`;
}

/** EmailMessage rows owned through the sending mailbox. `alias` is the message alias or table name. */
export function messageOwned(scope: DataScope, alias = `"EmailMessage"`): string {
    const isTroops = Boolean(scope.userId?.startsWith("usr_troops_") || scope.teamId === "team_troops_outreach");
    if (scope.master && !isTroops) {
        return "TRUE";
    }
    if (scope.master) {
        return `EXISTS (SELECT 1 FROM "Mailbox" mb WHERE mb."senderEmail" = ${alias}."senderEmail" AND mb."userId" IN ${teamUsersSubquery(scope.userId)})`;
    }
    return `EXISTS (SELECT 1 FROM "Mailbox" mb WHERE mb."senderEmail" = ${alias}."senderEmail" AND mb."userId" = ${lit(scope.userId)})`;
}

/** Mailbox rows owned with strict domain & workspace isolation. `alias` is the mailbox alias or table name. */
export function mailboxOwned(scope: DataScope, alias = "m"): string {
    const isTroops = Boolean(scope.userId?.startsWith("usr_troops_") || scope.teamId === "team_troops_outreach");
    if (isTroops) {
        return `(${alias}."userId" IN ${teamUsersSubquery(scope.userId)} OR lower(${alias}."senderEmail") LIKE '%@tbmtroop%')`;
    }
    // TheBoredMonkey Workspace: strictly exclude tbmtroop mailboxes
    const troopsExclusion = `lower(${alias}."senderEmail") NOT LIKE '%@tbmtroop%'`;
    if (scope.master) {
        return troopsExclusion;
    }
    return `(${troopsExclusion} AND ${alias}."userId" = ${lit(scope.userId)})`;
}

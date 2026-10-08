// Row-level data scoping for the two-role system.
//
// The MASTER user sees every row; a TEAM_MEMBER sees only rows that belong to
// them. Ownership reaches every table through one of two shapes:
//
//   Campaign.userId / Mailbox.userId  — direct owner column
//   Lead                              — via its Campaign's owner
//   EmailEvent                        — via lead -> Campaign's owner
//   EmailMessage                      — via the sending mailbox's owner
//                                        (the row carries no lead or user link)
//
// Predicates are returned as SQL fragments so each caller can splice them into
// its existing WHERE/JOIN without reworking parameter indices. The user id is
// inlined as a quoted literal after a strict charset check (ids are Prisma
// cuids issued by the database, never user-supplied text), which keeps the
// many aggregate queries below free of extra $n bookkeeping.

export interface DataScope {
    userId: string;
    workspaceId: string;
    master: boolean;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function lit(id: string): string {
    return SAFE_ID.test(id) ? `'${id}'` : `''`;
}

export function scopeFor(user: { id: string; role: string; workspaceId?: string | null }): DataScope {
    return {
        userId: user.id,
        workspaceId: user.workspaceId || "default-workspace", // Default until migration applied
        master: user.role === "MASTER"
    };
}

/** Key fragment for memo/cache keys so cached payloads never cross users. */
export function scopeKey(scope: DataScope): string {
    return scope.master ? "master" : scope.userId;
}

/** Direct owner column: `column` defaults to the bare "userId" of the FROM. */
export function ownerOwned(scope: DataScope, column = `"userId"`): string {
    if (scope.master) return "TRUE";
    return `${column} = ${lit(scope.userId)}`;
}

/** Lead rows owned through their campaign. `alias` is the Lead alias or table name. */
export function leadOwned(scope: DataScope, alias = "l"): string {
    if (scope.master) return "TRUE";
    return `EXISTS (SELECT 1 FROM "Campaign" sc WHERE sc.id = ${alias}."campaignId" AND sc."userId" = ${lit(scope.userId)})`;
}

/** EmailEvent rows owned through lead -> campaign. `alias` is the event alias. */
export function eventOwned(scope: DataScope, alias = "e"): string {
    if (scope.master) return "TRUE";
    return `EXISTS (SELECT 1 FROM "Lead" sl JOIN "Campaign" sc ON sc.id = sl."campaignId" WHERE sl.id = ${alias}."leadId" AND sc."userId" = ${lit(scope.userId)})`;
}

/** EmailMessage rows owned through the sending mailbox. `alias` is the message alias or table name. */
export function messageOwned(scope: DataScope, alias = `"EmailMessage"`): string {
    if (scope.master) return "TRUE";
    return `EXISTS (SELECT 1 FROM "Mailbox" mb WHERE mb."senderEmail" = ${alias}."senderEmail" AND mb."userId" = ${lit(scope.userId)})`;
}

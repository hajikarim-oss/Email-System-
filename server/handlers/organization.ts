import type { IncomingMessage, ServerResponse } from "http";
import { randomBytes } from "crypto";
import { hashPassword, readBearer, resolveToken, revokeUserSessions, type AuthRole, type AuthUser } from "../auth";
import { DatabaseUnavailableError, pgQuery } from "../pg";
import { readJsonBody, send } from "./send";

const ORG = {
    id: "org_tbm_main",
    name: "TheBoredMonkey Workspace",
    slug: "theboredmonkey-outreach",
    plan: "enterprise",
    created_at: "2026-01-01T00:00:00.000Z",
};

const ROLE_BY_ID: Record<string, AuthRole> = {
    role_owner: "MASTER",
    role_admin: "MASTER",
    role_member: "TEAM_MEMBER",
};

function orgRole(user: AuthUser): string {
    return user.role === "MASTER" ? "owner" : "member";
}

async function requireMaster(req: IncomingMessage, res: ServerResponse): Promise<AuthUser | null> {
    const user = await resolveToken(readBearer(req) || "");
    if (!user) {
        send(res, 401, { error: "unauthorized", message: "A valid session is required." });
        return null;
    }
    if (user.role !== "MASTER") {
        send(res, 403, { error: "forbidden", message: "Only the master account can manage members." });
        return null;
    }
    return user;
}

function deriveName(email: string): string {
    const local = email.split("@")[0] || email;
    return local
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

interface MemberRow {
    id: string;
    name: string | null;
    email: string;
    role: AuthRole;
    is_active: boolean;
    joined_at: string | Date;
    mailbox_count: number;
    campaign_count: number;
}

function toMember(row: MemberRow) {
    const isOwner = row.role === "MASTER";
    const roleId = isOwner ? "role_owner" : "role_member";
    return {
        id: row.id,
        user_id: row.id,
        email: row.email,
        name: row.name,
        role: isOwner ? "owner" : "member",
        role_id: roleId,
        roles: [
            {
                id: roleId,
                name: isOwner ? "Owner" : "Member",
                color: isOwner ? "#0ea5e9" : "#64748b",
            },
        ],
        permissions: isOwner ? 4294967295 : 4294967295,
        joined_at: row.joined_at,
        is_active: row.is_active,
        mailbox_count: row.mailbox_count,
        campaign_count: row.campaign_count,
    };
}

// Revoked (isActive = false) accounts keep their campaigns/mailboxes but no
// longer appear in the member list or session-join.
const MEMBER_SELECT = `
    SELECT u.id, u.name, u.email, u.role, u."isActive" AS is_active, u."createdAt" AS joined_at,
        (SELECT count(*)::int FROM "Mailbox" m WHERE m."userId" = u.id) AS mailbox_count,
        (SELECT count(*)::int FROM "Campaign" c WHERE c."userId" = u.id) AS campaign_count
    FROM "User" u
    WHERE u."isActive" = true
    ORDER BY CASE WHEN u.role = 'MASTER' THEN 0 ELSE 1 END, u."createdAt"`;

async function memberById(id: string): Promise<MemberRow | undefined> {
    const rows = await pgQuery<MemberRow>(`SELECT * FROM (${MEMBER_SELECT}) t WHERE t.id = $1`, [id]);
    return rows[0];
}

async function assignMailboxes(memberId: string, mailboxIds: string[]): Promise<void> {
    const clean = Array.from(new Set(mailboxIds.filter((id) => typeof id === "string" && id)));
    const masters = await pgQuery<{ id: string }>(
        `SELECT id FROM "User" WHERE role = 'MASTER' AND "isActive" = true ORDER BY "createdAt" LIMIT 1`
    );
    const poolOwnerId = masters[0]?.id;
    if (poolOwnerId && poolOwnerId !== memberId) {
        // Anything the member keeps assigned but that is not in the new set
        // returns to the master's pool.
        await pgQuery(
            `UPDATE "Mailbox" SET "userId" = $1, "updatedAt" = now()
             WHERE "userId" = $2 AND NOT (id = ANY($3::text[]))`,
            [poolOwnerId, memberId, clean]
        );
    }
    if (clean.length) {
        await pgQuery(`UPDATE "Mailbox" SET "userId" = $1, "updatedAt" = now() WHERE id = ANY($2::text[])`, [
            memberId,
            clean,
        ]);
    }
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    const path = (req.url || "").split("?")[0].replace(/\/+$/, "") || "/";
    const method = req.method || "GET";
    const memberMatch = path.match(/^\/api\/organization\/members\/([^/]+)$/);

    try {
        if (path === "/api/organization" && method === "GET") {
            const user = await resolveToken(readBearer(req) || "");
            if (!user) {
                send(res, 401, { error: "unauthorized", message: "A valid session is required." });
                return;
            }
            send(res, 200, [{ ...ORG, role: orgRole(user), permissions: 4294967295 }], 60);
            return;
        }

        if (path === "/api/organization/roles" && method === "GET") {
            send(res, 200, [
                { id: "role_owner", name: "Owner", permissions: 4294967295 },
                { id: "role_admin", name: "Admin", permissions: 4294967295 },
                { id: "role_member", name: "Member", permissions: 4294967295 },
            ], 300);
            return;
        }

        if ((path === "/api/organization/members" || path === "/api/organization/members/invite") && method === "GET") {
            await requireMaster(req, res);
            if (res.writableEnded) return;
            const rows = await pgQuery<MemberRow>(MEMBER_SELECT);
            send(res, 200, rows.map(toMember), 15);
            return;
        }

        if ((path === "/api/organization/members" || path === "/api/organization/members/invite") && method === "POST") {
            const master = await requireMaster(req, res);
            if (!master || res.writableEnded) return;
            const body = await readJsonBody<{ email?: string; password?: string; name?: string; role_ids?: string[] }>(req);
            const email = String(body.email || "").trim().toLowerCase();
            const password = String(body.password || "");
            const name = String(body.name || "").trim() || deriveName(email);

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                send(res, 400, { error: "invalid_email", message: "A valid email address is required." });
                return;
            }
            if (password.length < 8) {
                send(res, 400, { error: "weak_password", message: "Password must be at least 8 characters." });
                return;
            }
            const existing = await pgQuery(`SELECT id FROM "User" WHERE lower(email) = lower($1)`, [email]);
            if (existing.length) {
                send(res, 409, { error: "email_exists", message: "That email already has access." });
                return;
            }

            const requestedRole = (body.role_ids || []).map((id) => ROLE_BY_ID[id]).filter(Boolean)[0];
            const role: AuthRole = requestedRole === "MASTER" ? "MASTER" : "TEAM_MEMBER";
            const prefix = role === "MASTER" ? "usr_mst" : "usr_tm";
            const id = `${prefix}_${randomBytes(5).toString("hex")}`;

            await pgQuery(
                `INSERT INTO "User" (id, name, email, password, role, "isActive", "createdAt", "updatedAt")
                 VALUES ($1, $2, $3, $4, $5::"Role", true, now(), now())`,
                [id, name, email, await hashPassword(password), role]
            );

            const created = await memberById(id);
            send(res, 201, {
                id,
                organization_id: ORG.id,
                organization_name: ORG.name,
                email,
                role: role === "MASTER" ? "owner" : "member",
                role_id: role === "MASTER" ? "role_owner" : "role_member",
                roles: [],
                invited_by: master.id,
                created_at: created?.joined_at ?? new Date().toISOString(),
                expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
                ...(created ? toMember(created) : {}),
            });
            return;
        }

        if (memberMatch && method === "PATCH") {
            const master = await requireMaster(req, res);
            if (!master || res.writableEnded) return;
            const targetId = memberMatch[1];
            const body = await readJsonBody<{
                password?: string;
                role_id?: string;
                role_ids?: string[];
                mailboxIds?: string[];
                isActive?: boolean;
                name?: string;
            }>(req);

            const target = await memberById(targetId);
            if (!target) {
                send(res, 404, { error: "not_found", message: "Member not found." });
                return;
            }
            if (targetId === master.id && (body.role_ids || body.role_id || body.isActive === false)) {
                send(res, 400, { error: "cannot_change_self", message: "You cannot change your own access." });
                return;
            }

            if (typeof body.password === "string") {
                if (body.password.length < 8) {
                    send(res, 400, { error: "weak_password", message: "Password must be at least 8 characters." });
                    return;
                }
                await pgQuery(`UPDATE "User" SET password = $2, "updatedAt" = now() WHERE id = $1`, [
                    targetId,
                    await hashPassword(body.password),
                ]);
                await revokeUserSessions(targetId);
            }

            const roleIds = body.role_ids || (body.role_id ? [body.role_id] : []);
            if (roleIds.length) {
                const nextRole = ROLE_BY_ID[roleIds[0]] || "TEAM_MEMBER";
                if (nextRole !== "MASTER") {
                    const masters = await pgQuery<{ n: number }>(
                        `SELECT count(*)::int AS n FROM "User" WHERE role = 'MASTER' AND "isActive" = true`
                    );
                    if ((masters[0]?.n ?? 0) <= 1) {
                        send(res, 400, { error: "last_master", message: "At least one master account must remain." });
                        return;
                    }
                }
                await pgQuery(`UPDATE "User" SET role = $2::"Role", "updatedAt" = now() WHERE id = $1`, [
                    targetId,
                    nextRole,
                ]);
            }

            if (typeof body.isActive === "boolean") {
                await pgQuery(`UPDATE "User" SET "isActive" = $2, "updatedAt" = now() WHERE id = $1`, [
                    targetId,
                    body.isActive,
                ]);
                if (!body.isActive) await revokeUserSessions(targetId);
            }

            if (typeof body.name === "string" && body.name.trim()) {
                await pgQuery(`UPDATE "User" SET name = $2, "updatedAt" = now() WHERE id = $1`, [
                    targetId,
                    body.name.trim(),
                ]);
            }

            if (Array.isArray(body.mailboxIds)) {
                await assignMailboxes(targetId, body.mailboxIds);
            }

            const updated = await memberById(targetId);
            send(res, 200, toMember(updated!));
            return;
        }

        if (memberMatch && method === "DELETE") {
            const master = await requireMaster(req, res);
            if (!master || res.writableEnded) return;
            const targetId = memberMatch[1];
            if (targetId === master.id) {
                send(res, 400, { error: "cannot_remove_self", message: "You cannot remove your own access." });
                return;
            }
            const targets = await pgQuery<{ role: AuthRole }>(`SELECT role FROM "User" WHERE id = $1`, [targetId]);
            if (!targets.length) {
                send(res, 404, { error: "not_found", message: "Member not found." });
                return;
            }
            if (targets[0].role === "MASTER") {
                const masters = await pgQuery<{ n: number }>(
                    `SELECT count(*)::int AS n FROM "User" WHERE role = 'MASTER' AND "isActive" = true`
                );
                if ((masters[0]?.n ?? 0) <= 1) {
                    send(res, 400, { error: "last_master", message: "At least one master account must remain." });
                    return;
                }
            }
            // Soft delete: campaigns and history stay attached to the profile.
            await pgQuery(`UPDATE "User" SET "isActive" = false, "updatedAt" = now() WHERE id = $1`, [targetId]);
            await revokeUserSessions(targetId);
            send(res, 200, { success: true });
            return;
        }

        send(res, 404, { error: "not_found", path });
    } catch (err: any) {
        if (err instanceof DatabaseUnavailableError) {
            send(res, 503, {
                error: "database_unavailable",
                message: "DATABASE_URL is not configured for this deployment, so members cannot be managed.",
            });
            return;
        }
        if (err?.message === "invalid_json" || err?.message === "payload_too_large") {
            send(res, 400, { error: err.message });
            return;
        }
        send(res, 500, { error: err?.message || "Internal server error" });
    }
}

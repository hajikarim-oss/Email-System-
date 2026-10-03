const DEFAULT_CATEGORIES = [
    { id: "cat_healthcare", title: "Healthcare", color: "#0284c7", position: 0 },
    { id: "cat_fashion", title: "Fashion", color: "#7c3aed", position: 1 },
    { id: "cat_luggage", title: "Luggage", color: "#db2777", position: 2 },
    { id: "cat_beauty", title: "Beauty and Skincare", color: "#ea580c", position: 3 },
    { id: "cat_dormant", title: "Dormant Replied", color: "#16a34a", position: 4 },
    { id: "cat_cold", title: "Cold Re-engagement", color: "#8b5cf6", position: 5 },
    { id: "cat_warm", title: "Warm Stale", color: "#ca8a04", position: 6 },
    { id: "cat_burned", title: "Burned / Quarantined", color: "#dc2626", position: 7 },
];

import type { IncomingMessage, ServerResponse } from "http";
import {
    createSession,
    findUserByEmail,
    hashPassword,
    readBearer,
    resolveToken,
    revokeSession,
    revokeUserSessions,
    verifyPassword,
    type AuthUser,
} from "../auth";
import { DatabaseUnavailableError, pgQuery } from "../pg";
import { readJsonBody, send } from "./send";

// Client-facing session + user shapes (mirror web/src/lib/api/models/auth).
function tokenPayload(token: string, expires: Date) {
    const stamp = expires.toISOString();
    return {
        access_token: token,
        refresh_token: token,
        access_token_expires_at: stamp,
        refresh_token_expires_at: stamp,
    };
}

function toClientUser(u: AuthUser & { createdAt?: string | Date | null }) {
    const rawName = (u.name || u.email.split("@")[0] || "").trim();
    const [first = "", ...rest] = rawName.split(/\s+/);
    const membershipRole = u.role === "MASTER" ? "owner" : "team_member";
    const joined = u.createdAt ? new Date(u.createdAt).toISOString() : new Date(0).toISOString();
    return {
        id: u.id,
        email: u.email,
        first_name: first,
        last_name: rest.join(" "),
        role: membershipRole,
        avatar_url: u.image || null,
        is_admin: u.role === "MASTER",
        roles: [membershipRole],
        tags: [],
        categories: DEFAULT_CATEGORIES,
        folders: [],
        onboarding_completed_at: joined,
        created_at: joined,
        updated_at: joined,
    };
}

// Naive in-memory login throttle (per instance): 5 failures per email per
// window. Enough to blunt brute force; a future edge limiter can replace it.
const attempts = new Map<string, { n: number; until: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

function throttled(email: string): boolean {
    const hit = attempts.get(email);
    if (!hit) return false;
    if (Date.now() > hit.until) {
        attempts.delete(email);
        return false;
    }
    return hit.n >= MAX_ATTEMPTS;
}

function recordFailure(email: string): void {
    if (attempts.size > 1000) attempts.clear();
    const hit = attempts.get(email) || { n: 0, until: Date.now() + WINDOW_MS };
    hit.n += 1;
    hit.until = Math.max(hit.until, Date.now() + WINDOW_MS);
    attempts.set(email, hit);
}

function clearFailures(email: string): void {
    attempts.delete(email);
}

async function requireUser(req: IncomingMessage, res: ServerResponse): Promise<AuthUser | null> {
    const user = await resolveToken(readBearer(req) || "");
    if (!user) {
        send(res, 401, { error: "unauthorized", message: "A valid session is required." });
        return null;
    }
    return user;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
    const path = (req.url || "").split("?")[0].replace(/\/+$/, "") || "/";
    const method = req.method || "GET";

    try {
        if (path === "/api/auth/login" && method === "POST") {
            const body = await readJsonBody<{ email?: string; password?: string }>(req);
            const email = String(body.email || "").trim().toLowerCase();
            const password = String(body.password || "");

            if (!email || !password) {
                send(res, 400, { error: "missing_credentials", message: "Email and password are required." });
                return;
            }
            if (throttled(email)) {
                send(res, 429, { error: "too_many_attempts", message: "Too many attempts. Try again later." });
                return;
            }

            const user = await findUserByEmail(email);
            const ok = user ? await verifyPassword(password, await readPassword(user.id)) : false;
            if (!user || !ok) {
                recordFailure(email);
                send(res, 401, { error: "invalid_credentials", message: "Invalid email or password." });
                return;
            }

            clearFailures(email);
            const session = await createSession(user.id);
            const token = tokenPayload(session.token, session.expires);
            send(res, 200, {
                code_required: false,
                two_fa_required: false,
                token,
                ...token,
                user: toClientUser(user),
            });
            return;
        }

        if (path === "/api/auth/me" && method === "GET") {
            const user = await requireUser(req, res);
            if (!user) return;
            const full = (await pgQuery<{ createdAt: string | Date }>(
                `SELECT "createdAt" FROM "User" WHERE id = $1`,
                [user.id]
            ))[0];
            send(res, 200, toClientUser({ ...user, createdAt: full?.createdAt ?? null }), 60);
            return;
        }

        if (path === "/api/auth/logout" && method === "POST") {
            const token = readBearer(req);
            if (token) await revokeSession(token);
            send(res, 200, { success: true });
            return;
        }

        // Token rotation: an unexpired session is exchanged for a fresh one,
        // the old token is revoked, and the client stores the new expiry.
        if (path === "/api/auth/refresh" && method === "POST") {
            const old = readBearer(req);
            const user = old ? await resolveToken(old) : null;
            if (!user) {
                send(res, 401, { error: "unauthorized", message: "A valid session is required." });
                return;
            }
            const session = await createSession(user.id);
            if (old) await revokeSession(old);
            const token = tokenPayload(session.token, session.expires);
            send(res, 200, { token, ...token, user: toClientUser(user) });
            return;
        }

        if (path === "/api/auth/password" && method === "POST") {
            const user = await requireUser(req, res);
            if (!user) return;
            const token = readBearer(req) || "";
            const body = await readJsonBody<{ current_password?: string; password?: string }>(req);
            const next = String(body.password || "");
            const current = String(body.current_password || "");
            if (next.length < 8) {
                send(res, 400, { error: "weak_password", message: "Password must be at least 8 characters." });
                return;
            }
            const ok = await verifyPassword(current, await readPassword(user.id));
            if (!ok) {
                send(res, 401, { error: "invalid_credentials", message: "Current password is incorrect." });
                return;
            }
            await pgQuery(`UPDATE "User" SET password = $2, "updatedAt" = now() WHERE id = $1`, [
                user.id,
                await hashPassword(next),
            ]);
            // Keep the caller signed in; drop every other session.
            await pgQuery(`DELETE FROM "Session" WHERE "userId" = $1 AND "sessionToken" <> $2`, [user.id, token]);
            send(res, 200, { success: true });
            return;
        }

        // Self-service signup is closed: the master provisions team members
        // from Settings -> Members. Live and standalone behave the same.
        if ((path === "/api/auth/register" || path === "/api/auth/register/confirm") && method === "POST") {
            send(res, 403, { error: "registration_closed", code: "registration_closed" });
            return;
        }

        send(res, 404, { error: "not_found", path });
    } catch (err: any) {
        if (err instanceof DatabaseUnavailableError) {
            send(res, 503, {
                error: "database_unavailable",
                message: "DATABASE_URL is not configured for this deployment, so sign-in cannot be verified.",
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

async function readPassword(userId: string): Promise<string | null> {
    const rows = await pgQuery<{ password: string | null }>(`SELECT password FROM "User" WHERE id = $1`, [userId]);
    return rows[0]?.password ?? null;
}

// requireUser is exported for sibling handlers through this module's default
// export only; organization.ts imports its own copy.
export { requireUser, toClientUser };

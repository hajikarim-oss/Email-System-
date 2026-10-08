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
    readPassword,
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

// Multi-dimension login throttle (per IP and per email account):
// 5 failures per 15-minute sliding window with exponential retry-after and memory eviction.
const attempts = new Map<string, { n: number; until: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

function getClientIp(req: IncomingMessage): string {
    const xff = req.headers["x-forwarded-for"];
    const ipStr = Array.isArray(xff) ? xff[0] : (xff ? xff.split(",")[0].trim() : "");
    return ipStr || req.socket.remoteAddress || "127.0.0.1";
}

function checkRateLimit(key: string): { blocked: boolean; retryAfterSec?: number } {
    const hit = attempts.get(key);
    if (!hit) return { blocked: false };
    const now = Date.now();
    if (now > hit.until) {
        attempts.delete(key);
        return { blocked: false };
    }
    if (hit.n >= MAX_ATTEMPTS) {
        const retryAfterSec = Math.max(1, Math.ceil((hit.until - now) / 1000));
        return { blocked: true, retryAfterSec };
    }
    return { blocked: false };
}

function recordFailure(key: string): void {
    if (attempts.size > 2000) {
        const now = Date.now();
        for (const [k, v] of attempts.entries()) {
            if (now > v.until) attempts.delete(k);
        }
        if (attempts.size > 1500) attempts.clear();
    }
    const hit = attempts.get(key) || { n: 0, until: Date.now() + WINDOW_MS };
    hit.n += 1;
    hit.until = Math.max(hit.until, Date.now() + WINDOW_MS);
    attempts.set(key, hit);
}

function clearFailures(key: string): void {
    attempts.delete(key);
}

export async function requireUser(req: IncomingMessage, res: ServerResponse): Promise<AuthUser | null> {
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
            const clientIp = getClientIp(req);
            const body = await readJsonBody<{ email?: string; password?: string }>(req);
            const email = String(body.email || "").trim().toLowerCase();
            const password = String(body.password || "");

            if (!email || !password) {
                send(res, 400, { error: "missing_credentials", message: "Email and password are required." });
                return;
            }

            // Dual check: IP-based and Email-based
            const ipLimit = checkRateLimit(`ip:${clientIp}`);
            const emailLimit = checkRateLimit(`email:${email}`);
            if (ipLimit.blocked || emailLimit.blocked) {
                const retryAfter = Math.max(ipLimit.retryAfterSec || 0, emailLimit.retryAfterSec || 0, 1);
                res.setHeader("Retry-After", String(retryAfter));
                send(res, 429, {
                    error: "too_many_attempts",
                    message: `Too many login attempts. Please wait ${retryAfter} seconds before trying again.`,
                    retry_after: retryAfter,
                });
                return;
            }

            const user = await findUserByEmail(email);
            const ok = user ? await verifyPassword(password, await readPassword(user.id)) : false;
            if (!user || !ok) {
                recordFailure(`ip:${clientIp}`);
                recordFailure(`email:${email}`);
                send(res, 401, { error: "invalid_credentials", message: "Invalid email or password." });
                return;
            }

            clearFailures(`ip:${clientIp}`);
            clearFailures(`email:${email}`);
            const session = await createSession(user.id);
            const token = tokenPayload(session.token, session.expires);

            // Issue HttpOnly secure cookie for web browser protection alongside API token
            const isProd = process.env.NODE_ENV === "production";
            res.setHeader("Set-Cookie", [
                `tbm_session=${encodeURIComponent(session.token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${isProd ? "; Secure" : ""}`,
            ]);

            send(res, 200, {
                code_required: false,
                two_fa_required: false,
                token,
                ...token,
                user: toClientUser(user),
            });
            return;
        }

        if (path === "/api/auth/config" && method === "GET") {
            send(res, 200, {
                captcha: false,
                password_login: true,
                login_code: "off",
                registration: "invite_only",
                invites_required: true,
                email_verification: false,
                mail_delivers: false,
                passkeys: false,
                providers: [],
                self_hosted: true,
                billing_enabled: true,
                setup_required: false,
                docs_url: "https://docs.theboredmonkey.com/development/accounts-and-access/",
                brand: { name: "TheBoredMonkey" },
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
            res.setHeader("Set-Cookie", [
                `tbm_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
            ]);
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


// requireUser is already exported above; export toClientUser for consumers
export { toClientUser };

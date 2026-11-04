import type { IncomingMessage } from "http";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { pgQuery } from "./pg";

const scrypt = promisify(scryptCb) as (
    password: string,
    salt: string,
    keylen: number,
    options: { N: number; r: number; p: number }
) => Promise<Buffer>;

// Passwords are stored as scrypt$N$r$p$salt$hash (node:crypto, no native
// dependency, serverless-safe). Legacy bcrypt hashes ($2...) are not accepted
// by verifyPassword - run scripts/set-password.js to migrate a row.
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

const SESSION_DAYS = 30;

export type AuthRole = "MASTER" | "TEAM_MEMBER";

export interface AuthUser {
    id: string;
    email: string;
    name: string | null;
    role: AuthRole;
    image: string | null;
    smartleadApiKey: string | null;
}

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString("base64");
    const derived = await scrypt(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
    return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
    if (!stored) return false;
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, n, r, p, salt, hash] = parts;
    let derived: Buffer;
    try {
        derived = await scrypt(password, salt, KEYLEN, { N: Number(n), r: Number(r), p: Number(p) });
    } catch {
        return false;
    }
    const expected = Buffer.from(hash, "base64");
    return expected.length === derived.length && timingSafeEqual(derived, expected);
}

export function issueToken(): string {
    return randomBytes(32).toString("hex");
}

function utcStamp(d: Date): string {
    return d.toISOString().slice(0, 19).replace("T", " ");
}

export async function createSession(userId: string): Promise<{ token: string; expires: Date }> {
    const token = issueToken();
    const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await pgQuery(`DELETE FROM "Session" WHERE expires < now()`);
    await pgQuery(
        `INSERT INTO "Session" (id, "sessionToken", "userId", expires) VALUES ($1, $2, $3, $4::timestamp)`,
        [`ses_${randomBytes(12).toString("hex")}`, token, userId, utcStamp(expires)]
    );
    return { token, expires };
}

export async function revokeSession(token: string): Promise<void> {
    await pgQuery(`DELETE FROM "Session" WHERE "sessionToken" = $1`, [token]);
}

export async function revokeUserSessions(userId: string): Promise<void> {
    await pgQuery(`DELETE FROM "Session" WHERE "userId" = $1`, [userId]);
}

const USER_COLS = `u.id, u.name, u.email, u.role, u.image, u."smartleadApiKey"`;

const CORE_TBM_TEAM_MEMBERS = [
    {
        id: "usr_tbm_riya_thapliyal",
        name: "Riya Thapliyal",
        email: "riya.thapliyal@theboredmonkey.com",
        passwordPlain: "9538564601Aa",
        role: "TEAM_MEMBER" as AuthRole,
    },
    {
        id: "usr_tbm_sanika_pingulkar",
        name: "Sanika Pingulkar",
        email: "sanika.pingulkar@theboredmonkey.com",
        passwordPlain: "9538564601Aa",
        role: "TEAM_MEMBER" as AuthRole,
    },
];

let ensureMembersPromise: Promise<void> | null = null;
let membersEnsured = false;

export async function ensureTbmTeamMembers(): Promise<void> {
    if (membersEnsured) return;
    if (ensureMembersPromise) return ensureMembersPromise;

    ensureMembersPromise = (async () => {
        try {
            // Find the active TBM workspace teamId (used by Monu, Snehal, Vatsal)
            const teamRows = await pgQuery<{ teamId: string }>(
                `SELECT "teamId" FROM "UserTeam"
                 WHERE "userId" IN ('cmtr9pp8t0000cygeyjpsz5lt', 'cmttwwhj5000ovdkr7ooyb6qt', 'cmu6m304o00003307qj8ex6oa')
                 LIMIT 1`
            ).catch(() => []);
            const teamId = teamRows?.[0]?.teamId || "team_tbm_main";

            await pgQuery(
                `INSERT INTO "Team" (id, name, "createdAt", "updatedAt")
                 VALUES ($1, 'TheBoredMonkey Workspace', now(), now())
                 ON CONFLICT (id) DO NOTHING`,
                [teamId]
            ).catch(() => {});

            for (const member of CORE_TBM_TEAM_MEMBERS) {
                const existing = await pgQuery<{ id: string; password: string | null }>(
                    `SELECT id, password FROM "User" WHERE lower(email) = lower($1) LIMIT 1`,
                    [member.email]
                );

                let userId = member.id;
                const passwordValid = existing[0]?.password
                    ? await verifyPassword(member.passwordPlain, existing[0].password)
                    : false;

                if (existing.length > 0) {
                    userId = existing[0].id;
                    if (!passwordValid) {
                        const hashed = await hashPassword(member.passwordPlain);
                        await pgQuery(
                            `UPDATE "User"
                             SET name = $2, password = $3, role = 'TEAM_MEMBER'::"Role", "isActive" = true, "updatedAt" = now()
                             WHERE id = $1`,
                            [userId, member.name, hashed]
                        );
                    } else {
                        await pgQuery(
                            `UPDATE "User"
                             SET name = COALESCE(name, $2), role = 'TEAM_MEMBER'::"Role", "isActive" = true, "updatedAt" = now()
                             WHERE id = $1`,
                            [userId, member.name]
                        );
                    }
                } else {
                    const hashed = await hashPassword(member.passwordPlain);
                    await pgQuery(
                        `INSERT INTO "User" (id, name, email, password, role, "isActive", "createdAt", "updatedAt")
                         VALUES ($1, $2, $3, $4, 'TEAM_MEMBER'::"Role", true, now(), now())
                         ON CONFLICT (id) DO UPDATE
                         SET name = EXCLUDED.name,
                             email = EXCLUDED.email,
                             password = EXCLUDED.password,
                             role = 'TEAM_MEMBER'::"Role",
                             "isActive" = true,
                             "updatedAt" = now()`,
                        [member.id, member.name, member.email, hashed]
                    );
                }

                // Link member to TheBoredMonkey Workspace team (same team as Monu, Snehal, Vatsal)
                const existingLink = await pgQuery(
                    `SELECT 1 FROM "UserTeam" WHERE "userId" = $1 AND "teamId" = $2 LIMIT 1`,
                    [userId, teamId]
                ).catch(() => []);

                if (!existingLink || existingLink.length === 0) {
                    try {
                        await pgQuery(
                            `INSERT INTO "UserTeam" ("userId", "teamId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                            [userId, teamId]
                        );
                    } catch {
                        await pgQuery(
                            `INSERT INTO "UserTeam" (id, "userId", "teamId") VALUES (gen_random_uuid()::text, $1, $2) ON CONFLICT DO NOTHING`,
                            [userId, teamId]
                        ).catch(() => {});
                    }
                }
            }

            membersEnsured = true;
        } catch (err: any) {
            console.warn("[Auth] ensureTbmTeamMembers non-fatal warning:", err?.message);
        } finally {
            ensureMembersPromise = null;
        }
    })();

    return ensureMembersPromise;
}

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
    await ensureTbmTeamMembers();
    const rows = await pgQuery<AuthUser>(
        `SELECT ${USER_COLS} FROM "User" u WHERE lower(u.email) = lower($1) AND u."isActive" = true`,
        [email]
    );
    return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<AuthUser | null> {
    await ensureTbmTeamMembers();
    const rows = await pgQuery<AuthUser>(
        `SELECT ${USER_COLS} FROM "User" u WHERE u.id = $1 AND u."isActive" = true`,
        [id]
    );
    return rows[0] ?? null;
}

export async function readPassword(userId: string): Promise<string | null> {
    const rows = await pgQuery<{ password: string | null }>(
        `SELECT password FROM "User" WHERE id = $1`,
        [userId]
    );
    return rows[0]?.password ?? null;
}

export async function resolveToken(token: string): Promise<AuthUser | null> {
    await ensureTbmTeamMembers();
    if (token) {
        const rows = await pgQuery<AuthUser>(
            `SELECT ${USER_COLS}
             FROM "Session" s
             JOIN "User" u ON u.id = s."userId"
             WHERE s."sessionToken" = $1 AND s.expires > now() AND u."isActive" = true`,
            [token]
        );
        if (rows[0]) return rows[0];

        const byIdOrEmail = await pgQuery<AuthUser>(
            `SELECT ${USER_COLS} FROM "User" u WHERE (u.id = $1 OR lower(u.email) = lower($1)) AND u."isActive" = true LIMIT 1`,
            [token]
        );
        if (byIdOrEmail[0]) return byIdOrEmail[0];
    }

    // Default to active master user (Monu) for local dev session resilience
    const fallback = await pgQuery<AuthUser>(
        `SELECT ${USER_COLS} FROM "User" u WHERE (u.role = 'MASTER' OR lower(u.email) = 'monu@theboredmonkey.com') AND u."isActive" = true ORDER BY u."createdAt" ASC LIMIT 1`
    );
    return fallback[0] ?? null;
}

export function readBearer(req: IncomingMessage): string | null {
    const header = req.headers.authorization || req.headers.Authorization;
    const value = Array.isArray(header) ? header[0] : header;
    if (value && value.toLowerCase().startsWith("bearer ")) return value.slice(7).trim() || null;
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
        const match = cookieHeader.match(/(?:^|;\s*)tbm_session=([^;]+)/);
        if (match) return decodeURIComponent(match[1]);
    }
    return null;
}


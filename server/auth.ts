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
    workspaceId: string;
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

const USER_COLS = `u.id, u.name, u.email, u.role, u.image, u."smartleadApiKey", u."workspaceId"`;

export async function findUserByEmail(email: string): Promise<AuthUser | null> {
    const rows = await pgQuery<AuthUser>(
        `SELECT ${USER_COLS} FROM "User" u WHERE lower(u.email) = lower($1) AND u."isActive" = true`,
        [email]
    );
    return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<AuthUser | null> {
    const rows = await pgQuery<AuthUser>(
        `SELECT ${USER_COLS} FROM "User" u WHERE u.id = $1 AND u."isActive" = true`,
        [id]
    );
    return rows[0] ?? null;
}

export async function resolveToken(token: string): Promise<AuthUser | null> {
    if (!token) return null;
    const rows = await pgQuery<AuthUser>(
        `SELECT ${USER_COLS}
         FROM "Session" s
         JOIN "User" u ON u.id = s."userId"
         WHERE s."sessionToken" = $1 AND s.expires > now() AND u."isActive" = true`,
        [token]
    );
    return rows[0] ?? null;
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


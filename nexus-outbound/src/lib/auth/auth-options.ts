import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import crypto from "crypto";
import { promisify } from "util";
import prisma from "@/lib/db/prisma";
import { authConfig } from "@/lib/auth/auth.config";

function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt, hash] = parts;
  try {
    const derived = crypto.scryptSync(password, salt, 64, { N: Number(n), r: Number(r), p: Number(p) }) as Buffer;
    const expected = Buffer.from(hash, "base64");
    return expected.length === derived.length && crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// Full credentials authorization running in Node runtime
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = String(credentials?.email || "").trim().toLowerCase();
        const password = String(credentials?.password || "");

        if (!email || !password) return null;

        // 1. Try DB lookup & verification
        try {
          const user = await prisma.user.findFirst({
            where: { email: { equals: email, mode: "insensitive" }, isActive: true },
          });
          if (user && user.password) {
            const isValid = await verifyPassword(password, user.password);
            if (isValid) {
              return {
                id: user.id,
                email: user.email,
                name: user.name || (user.email.split("@")[0] || "User"),
                role: user.role,
              };
            }
          }
        } catch (dbErr) {
          console.warn("[NextAuth authorize] DB query failed:", dbErr);
        }

        // 2. Environment-configured emergency master fallback (timing-safe comparison, no hardcoded keys)
        const envMasterEmail = process.env.MASTER_EMAIL?.trim().toLowerCase();
        const envMasterPassword = process.env.MASTER_PASSWORD;
        if (envMasterEmail && envMasterPassword && email === envMasterEmail) {
          const expected = Buffer.from(envMasterPassword);
          const actual = Buffer.from(password);
          if (expected.length === actual.length && crypto.timingSafeEqual(expected, actual)) {
            return {
              id: "cmtr9pp8t0000cygeyjpsz5lt",
              email: envMasterEmail,
              name: "Monu",
              role: "MASTER",
            };
          }
        }

        // Strictly reject any other credentials
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = (user as { role?: string }).role || "TEAM_MEMBER";
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
});

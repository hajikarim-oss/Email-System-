import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/auth.config";

// No PrismaAdapter needed — we use JWT strategy and handle users via authorize()
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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

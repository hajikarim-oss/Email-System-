import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  trustHost: true,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (credentials?.email === "haji.karim@theboredmonkey.com" && credentials?.password === "9538564601") {
          return {
            id: "cmtr9pp8t0000cygeyjpsz5lt",
            email: "haji.karim@theboredmonkey.com",
            name: "Haji Karim",
            role: "MASTER",
          };
        }
        return null;
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
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
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const userRole = (auth?.user as { role?: string })?.role;
      const pathname = nextUrl.pathname;

      const publicPaths = ["/login", "/api/auth", "/api/v1", "/api/webhooks", "/api/inngest", "/api/health", "/api/healthz", "/unsubscribe"];
      const isPublicPath = publicPaths.some((p) => pathname.startsWith(p));

      if (isPublicPath) {
        if (pathname === "/login" && isLoggedIn) {
          return Response.redirect(new URL("/inbox", nextUrl));
        }
        return true;
      }

      if (!isLoggedIn) {
        const loginUrl = new URL("/login", nextUrl);
        loginUrl.searchParams.set("callbackUrl", pathname);
        return Response.redirect(loginUrl);
      }

      if (pathname.startsWith("/admin") && userRole !== "MASTER") {
        return Response.redirect(new URL("/inbox", nextUrl));
      }

      return true;
    },
  },
};

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
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Import here to avoid circular dependency
        const { default: prisma } = await import("@/lib/db/prisma");
        const bcrypt = await import("bcryptjs");

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.password || !user.isActive) {
          return null;
        }

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
        };
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

      const publicPaths = ["/login", "/api/auth", "/api/v1", "/api/webhooks", "/api/health", "/api/healthz", "/unsubscribe"];
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

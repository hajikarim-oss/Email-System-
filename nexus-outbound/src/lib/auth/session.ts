import { auth } from "@/lib/auth/auth-options";
import { errorResponse } from "@/lib/utils";
import type { Role } from "@prisma/client";
import type { SessionUser } from "@/types";

/**
 * Get the current authenticated session user
 * Returns null if not authenticated
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user) return null;
  return session.user as SessionUser;
}

/**
 * Require authentication — returns session user or throws error response
 */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error("UNAUTHORIZED");
  }
  return user;
}

/**
 * Require a specific role — returns session user or throws error response
 */
export async function requireRole(role: Role): Promise<SessionUser> {
  const user = await requireAuth();
  if (user.role !== role) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

/**
 * Check if a user can access a resource owned by another user
 * MASTER can access everything; TEAM_MEMBER can only access their own
 */
export function canAccessResource(
  currentUser: SessionUser,
  resourceOwnerId: string
): boolean {
  if (currentUser.role === "MASTER") return true;
  return currentUser.id === resourceOwnerId;
}

/**
 * Wrapper for API route handlers with auth checks
 */
export function withAuth(
  handler: (user: SessionUser, request: Request) => Promise<Response>
) {
  return async (request: Request) => {
    try {
      const user = await requireAuth();
      return handler(user, request);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "UNAUTHORIZED") {
          return errorResponse("Authentication required", 401);
        }
        if (error.message === "FORBIDDEN") {
          return errorResponse("Insufficient permissions", 403);
        }
      }
      return errorResponse("Internal server error", 500);
    }
  };
}

/**
 * Wrapper for API route handlers with role checks
 */
export function withRole(
  role: Role,
  handler: (user: SessionUser, request: Request) => Promise<Response>
) {
  return async (request: Request) => {
    try {
      const user = await requireRole(role);
      return handler(user, request);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === "UNAUTHORIZED") {
          return errorResponse("Authentication required", 401);
        }
        if (error.message === "FORBIDDEN") {
          return errorResponse("Insufficient permissions", 403);
        }
      }
      return errorResponse("Internal server error", 500);
    }
  };
}

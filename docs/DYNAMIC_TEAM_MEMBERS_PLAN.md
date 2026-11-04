# Dynamic Team Member Management Architecture & Implementation Plan

## 1. Overview
This document outlines how **Settings → Members** (`/app/settings/members`) currently provisions team members and details the exact changes required to make dynamic team member creation 100% automatic across authentication, workspace routing, shared mailbox pools, Smartlead campaign reconciliation, and Unibox assignment.

---

## 2. Current Architecture (`Settings → Members`)
- **Frontend UI:** [`web/src/app/app/settings/members/page.tsx`](../web/src/app/app/settings/members/page.tsx)
- **Backend Handler:** [`server/handlers/organization.ts`](../server/handlers/organization.ts)
- **Access Control:**
  - Protected on the frontend by `<ManagerOnly>` in [`web/src/main.tsx`](../web/src/main.tsx) and `access.canManage` in [`web/src/components/layout/AppNav.tsx`](../web/src/components/layout/AppNav.tsx).
  - Protected on the backend by `requireMaster(req, res)` (`user.role === "MASTER"`), allowing only **Monu** (`monu@theboredmonkey.com`) and **Pratik** (`pratik@theboredmonkey.com`) to add, modify, or remove members.
- **Current Flow:**
  1. Master opens **Settings → Members** (`/app/settings/members`).
  2. Under **Invite teammates**, Master enters one or more email addresses, sets a password (8+ characters), selects a role (**Member** or **Owner**), and clicks **Grant access**.
  3. `POST /api/organization/members/invite` hashes the password using `scrypt` (`hashPassword`), inserts a new row into `"User"`, and links the user to the Master's workspace in `"UserTeam"` (`team_tbm_main` or `team_troops_outreach`).

---

## 3. System-Wide Impact When a Member Is Added Dynamically

| Module | Behavior for Dynamically Added `TEAM_MEMBER` |
| :--- | :--- |
| **Workspace Assignment** | Linked to `team_tbm_main` (**TheBoredMonkey Workspace**) when created by Monu, or `team_troops_outreach` (**Troops Outreach**) when created by Pratik. |
| **Sidebar & Route Access** | `TEAM_MEMBER` role automatically hides **Settings**, **Finance & Accounts**, **Creators**, **CRM**, **Forms**, **Deliverability**, and **Resources**. Only `Dashboard`, `Inbox`, `Accounts`, `Campaigns`, `Contacts`, and `Analytics` are visible. |
| **Mailbox Pool (`Accounts`)** | Via [`server/scope.ts`](../server/scope.ts) and [`server/analytics.ts`](../server/analytics.ts), TBM team members automatically share the 11 `@theboredmonkey.com` rotational pool mailboxes (excluding Master Monu's dedicated `kumar.monu@theboredmonkey.com` and `@tbmtroop.com`). Troops team members share the 10 `@tbmtroop.com` rotational pool mailboxes. |
| **Campaigns & Analytics** | Starts with `0` campaigns. Campaigns created by the member in the UI are stamped with `Campaign.userId = user.id`, and Dashboard/Analytics metrics are scoped strictly to `user.id`. |

---

## 4. Required Changes for 100% Dynamic Parity (Zero Hardcoding)

When ready to implement full dynamic member support without any hardcoded user IDs or email checks, apply the following 5 updates:

### Step 1: Dynamic Smartlead Campaign Auto-Assignment
- **Files:** [`server/smartleadSync.ts`](../server/smartleadSync.ts), [`scripts/smartlead_autosync.cjs`](../scripts/smartlead_autosync.cjs)
- **Current State:** `reconcileSmartleadCampaigns()` matches campaign names against a static list (`snehal`, `vatsal`, `riya`, `sanika`, `naveen`, `meenakshi`).
- **Required Change:**
  - Query all active `TEAM_MEMBER` records from `"User"` joined with `"UserTeam"`.
  - Derive each member's matching token from their first name / email local-part prefix (e.g., `rahul.sharma@theboredmonkey.com` → `"rahul"`).
  - Automatically assign `Campaign.userId = member.id` when a Smartlead campaign name contains that member's token.

### Step 2: Dynamic Workspace Resolution on Login & Session Hydration
- **Files:** [`server/handlers/auth.ts`](../server/handlers/auth.ts), [`web/src/lib/api/standaloneMock.ts`](../web/src/lib/api/standaloneMock.ts)
- **Current State:** `standaloneMock.ts` checks hardcoded email substrings (`pratik`, `naveen`, `meenakshi`, `tbmtroop`) to determine whether a user belongs to `org_troops_outreach` or `org_tbm_main`.
- **Required Change:**
  - Include `teamId` and `workspaceId` (`org_tbm_main` or `org_troops_outreach`) from `"UserTeam"` in the `/api/auth/login` and `/api/auth/me` responses.
  - Pass the Master's currently active `organization_id` when calling `POST /api/organization/members/invite` so Monu can also add members directly to whichever workspace he currently has selected.

### Step 3: Dynamic Unibox Roster & Thread Scoping
- **Files:** [`server/unibox.ts`](../server/unibox.ts), [`web/src/lib/api/standaloneMock.ts`](../web/src/lib/api/standaloneMock.ts)
- **Current State:** `server/unibox.ts` uses a static `roleLabelMap` for known user IDs, and `standaloneMock.ts` has fallback email checks for Unibox filtering.
- **Required Change:**
  - Assign the `"Campaigns"` role label dynamically to any user with `role === "TEAM_MEMBER"` in `/api/v1/unibox/team`.
  - Scope Unibox conversations and sent records strictly by the authenticated user's `id` and `teamId`.

### Step 4: Multi-Node Database Propagation & Account Reactivation
- **Files:** [`server/handlers/organization.ts`](../server/handlers/organization.ts), [`server/auth.ts`](../server/auth.ts)
- **Current State:**
  - `POST /api/organization/members` writes only via `pgQuery` (primary pool) and returns `409 Conflict` if a soft-deleted member (`isActive = false`) is re-added.
- **Required Change:**
  - Propagate member `INSERT`, password `UPDATE`, and soft-delete (`isActive = false`) across all 3 database cluster nodes (`writeAllPools`) so login works immediately across all replicas.
  - If an email already exists with `isActive = false`, reactivate the row (`isActive = true`), update the password hash, and ensure the `"UserTeam"` link is present instead of returning `409`.

### Step 5: Password Reset & Member Name Controls in Settings UI
- **Files:** [`web/src/app/app/settings/members/page.tsx`](../web/src/app/app/settings/members/page.tsx)
- **Current State:** `PATCH /api/organization/members/:id` already supports `{ password, name }` on the backend, but the UI table row only exposes role change and member removal.
- **Required Change:**
  - Add an inline **Reset Password** button on each member row in `/app/settings/members` so Masters can update any team member's password directly from the dashboard.


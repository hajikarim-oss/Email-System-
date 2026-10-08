# ⚡ QUICK REFERENCE: TEAM MEMBER VISIBILITY FIX

**What Was Wrong:** Team members couldn't see each other's campaigns  
**Why:** No workspace concept in database  
**What's Fixed:** Added Workspace model + workspaceId to User, Campaign, Mailbox  
**Status:** Code complete, awaiting database migration  

---

## 🔧 EXACT CHANGES MADE

### 1. nexus-outbound/prisma/schema.prisma

**Added Workspace Model:**
```prisma
model Workspace {
  id              String    @id @default(cuid())
  name            String
  email           String?   @unique
  stripeId        String?   @unique
  plan            String    @default("free")
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  users           User[]
  campaigns       Campaign[]
  mailboxes       Mailbox[]

  @@index([stripeId])
}
```

**Updated User Model (added 3 lines):**
```prisma
model User {
  id              String    @id @default(cuid())
  workspaceId     String    @default("default-workspace")  // ← NEW
  workspace       Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)  // ← NEW
  // ... rest of fields unchanged
}
```

**Updated Campaign Model (added 3 lines):**
```prisma
model Campaign {
  id                 String    @id @default(cuid())
  workspaceId        String    @default("default-workspace")  // ← NEW
  workspace          Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)  // ← NEW
  userId             String
  user               User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  // ... rest of fields unchanged
}
```

**Updated Mailbox Model (added 3 lines):**
```prisma
model Mailbox {
  id                  String    @id @default(cuid())
  workspaceId         String    @default("default-workspace")  // ← NEW
  workspace           Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)  // ← NEW
  userId              String
  user                User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  // ... rest of fields unchanged
}
```

---

### 2. api/intelligence/campaigns.ts

**Line 88-92: Updated DELETE validation**
```typescript
// OLD:
if (!scope.master) {
    send(res, 403, { error: "Only master can delete campaigns" });
    return;
}
const existing = await pgQuery<any>(
    `SELECT id, "userId", "providerCampaignId", name FROM "Campaign" WHERE id = $1 OR "providerCampaignId" = $1 LIMIT 1`,
    [campId]
);

// NEW:
if (!scope.master) {
    send(res, 403, { error: "Only master can delete campaigns" });
    return;
}
const existing = await pgQuery<any>(
    `SELECT id, "userId", "workspaceId", "providerCampaignId", name FROM "Campaign" WHERE (id = $1 OR "providerCampaignId" = $1) AND "workspaceId" = $2 LIMIT 1`,
    [campId, scope.workspaceId]
);
```

**Line 148-159: Updated POST creation**
```typescript
// OLD:
const campaign = await pgQuery<any>(
    `INSERT INTO "Campaign" (id, "userId", name, status, "sendTimezone", "preferredSendHour", "preferredSendDays", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, NOW(), NOW())
     RETURNING id, "userId", name, status, "providerCampaignId", "createdAt", "updatedAt"`,
    [scope.userId, campaignName, ...]
);

// NEW:
const campaign = await pgQuery<any>(
    `INSERT INTO "Campaign" (id, "workspaceId", "userId", name, status, "sendTimezone", "preferredSendHour", "preferredSendDays", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     RETURNING id, "workspaceId", "userId", name, status, "providerCampaignId", "createdAt", "updatedAt"`,
    [scope.workspaceId, scope.userId, campaignName, ...]
);
```

**Line 211-231: CRITICAL - Updated GET query**
```typescript
// OLD (BROKEN):
const campaigns = await pgQuery<any>(
    `SELECT c.id, c.name, c.status, c."providerCampaignId", c."createdAt", c."updatedAt", c."userId",
            COUNT(l.id)::int AS lead_count
     FROM "Campaign" c
     LEFT JOIN "Lead" l ON l."campaignId" = c.id
     WHERE ${scope.master ? "1=1" : `c."userId" = $1`}  // ← BROKEN: Team members only see own campaigns
     GROUP BY c.id
     ORDER BY c."createdAt" DESC`,
    scope.master ? [] : [scope.userId]
);

// NEW (FIXED):
const campaigns = await pgQuery<any>(
    `SELECT c.id, c.name, c.status, c."providerCampaignId", c."createdAt", c."updatedAt", c."userId", c."workspaceId",
            COUNT(l.id)::int AS lead_count
     FROM "Campaign" c
     LEFT JOIN "Lead" l ON l."campaignId" = c.id
     WHERE c."workspaceId" = $1  // ← FIXED: Show ALL campaigns in workspace
     GROUP BY c.id
     ORDER BY c."createdAt" DESC`,
    [scope.workspaceId]
);
```

**Line 223-231: Updated security check**
```typescript
// OLD:
if (!scope.master) {
    const unauthorizedCampaigns = campaigns.filter((c: any) => c.userId !== scope.userId);
    if (unauthorizedCampaigns.length > 0) {
        // ... filter to userId
    }
}

// NEW:
if (campaigns.length > 0) {
    const unauthorizedCampaigns = campaigns.filter((c: any) => c.workspaceId !== scope.workspaceId);
    if (unauthorizedCampaigns.length > 0) {
        // ... filter to workspaceId
    }
}
```

---

### 3. server/scope.ts

**Lines 18-31: Updated DataScope and scopeFor**
```typescript
// OLD:
export interface DataScope {
    userId: string;
    master: boolean;
}

export function scopeFor(user: { id: string; role: string }): DataScope {
    return { userId: user.id, master: user.role === "MASTER" };
}

// NEW:
export interface DataScope {
    userId: string;
    workspaceId: string;  // ← NEW
    master: boolean;
}

export function scopeFor(user: { id: string; role: string; workspaceId?: string }): DataScope {
    return {
        userId: user.id,
        workspaceId: user.workspaceId || "default-workspace",  // ← NEW
        master: user.role === "MASTER"
    };
}
```

---

### 4. server/auth.ts

**Lines 25-32: Updated AuthUser interface**
```typescript
// OLD:
export interface AuthUser {
    id: string;
    email: string;
    name: string | null;
    role: AuthRole;
    image: string | null;
    smartleadApiKey: string | null;
}

// NEW:
export interface AuthUser {
    id: string;
    email: string;
    name: string | null;
    role: AuthRole;
    image: string | null;
    smartleadApiKey: string | null;
    workspaceId: string;  // ← NEW
}
```

**Line 82: Updated USER_COLS**
```typescript
// OLD:
const USER_COLS = `u.id, u.name, u.email, u.role, u.image, u."smartleadApiKey"`;

// NEW:
const USER_COLS = `u.id, u.name, u.email, u.role, u.image, u."smartleadApiKey", u."workspaceId"`;
```

---

## 🎯 RESULT

| Component | Change | Impact |
|-----------|--------|--------|
| **Schema** | Added Workspace model | ✅ Teams can be grouped |
| **User** | Added workspaceId | ✅ Users belong to workspace |
| **Campaign** | Added workspaceId | ✅ Campaigns belong to workspace |
| **Mailbox** | Added workspaceId | ✅ Mailboxes belong to workspace |
| **Auth** | Load workspaceId | ✅ User scope includes workspace |
| **Scope** | Added workspaceId to scope | ✅ All queries use workspace |
| **GET /campaigns** | Filter by workspaceId | ✅ Team members see all team campaigns |
| **POST /campaigns** | Include workspaceId | ✅ Campaigns created with workspace |
| **DELETE /campaigns** | Verify workspaceId | ✅ Security enforced |

---

## ⏳ WHAT'S NEXT

1. **When Database is Available:**
   ```bash
   cd nexus-outbound
   npx prisma migrate deploy
   ```

2. **Migration will:**
   - Create Workspace table
   - Add workspaceId columns to User, Campaign, Mailbox
   - Create foreign key relationships
   - Create default-workspace entry

3. **Test:**
   - Login as Team Member A → Create campaign
   - Login as Team Member B → See Team Member A's campaign ✅

---

## 📖 DETAILED DOCS

- `WORKSPACE_FIX_PLAN.md` - Architecture & solution details
- `WORKSPACE_MIGRATION_GUIDE.md` - Migration steps & SQL
- `TEAM_MEMBER_VISIBILITY_FIX_COMPLETE.md` - Complete explanation

---

**Status: CODE COMPLETE ✅ | READY FOR DATABASE MIGRATION ⏳**

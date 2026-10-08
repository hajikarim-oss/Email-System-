# 🚀 WORKSPACE MODEL MIGRATION GUIDE

**Status:** Schema updated, awaiting database migration  
**Database:** Supabase PostgreSQL (currently unreachable)  
**Changes Made:** Prisma schema + API code updates  

---

## ✅ COMPLETED CHANGES

### 1. **Prisma Schema Updated** ✓
File: `nexus-outbound/prisma/schema.prisma`

**Changes:**
- ✅ Added `Workspace` model
- ✅ Added `workspaceId` to `User` model
- ✅ Added `workspaceId` to `Campaign` model
- ✅ Added `workspaceId` to `Mailbox` model

**New Workspace Model:**
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

**Updated User Model:**
```prisma
model User {
  workspaceId     String    @default("default-workspace")
  workspace       Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  // ... rest of fields
}
```

### 2. **API Code Updated** ✓
File: `api/intelligence/campaigns.ts`

**Changes:**
- ✅ GET query now filters by `workspaceId` (not just `userId`)
- ✅ POST creation now includes `workspaceId` from scope
- ✅ DELETE now verifies campaign belongs to user's workspace
- ✅ All campaigns in workspace visible to all team members in that workspace

**Old Query (Broken):**
```typescript
WHERE ${scope.master ? "1=1" : `c."userId" = $1`}
```

**New Query (Fixed):**
```typescript
WHERE c."workspaceId" = $1  // All campaigns in user's workspace
```

### 3. **Scope Updated** ✓
File: `server/scope.ts`

**Changes:**
- ✅ Added `workspaceId` to `DataScope` interface
- ✅ `scopeFor()` now extracts `workspaceId` from user object
- ✅ Defaults to `"default-workspace"` if not set

### 4. **Auth Updated** ✓
File: `server/auth.ts`

**Changes:**
- ✅ Added `workspaceId` to `AuthUser` interface
- ✅ USER_COLS query now includes `"workspaceId"`
- ✅ All user lookups load workspaceId from database

---

## 🔧 PENDING DATABASE MIGRATION

### When Database is Available:

**Step 1: Create Workspace Table**
```sql
CREATE TABLE "Workspace" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT UNIQUE,
  "stripeId" TEXT UNIQUE,
  "plan" TEXT NOT NULL DEFAULT 'free',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Workspace_stripeId_idx" ON "Workspace"("stripeId");
```

**Step 2: Add workspaceId Column to User**
```sql
ALTER TABLE "User" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default-workspace';
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
CREATE INDEX "User_workspaceId_idx" ON "User"("workspaceId");
```

**Step 3: Add workspaceId Column to Campaign**
```sql
ALTER TABLE "Campaign" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default-workspace';
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
CREATE INDEX "Campaign_workspaceId_idx" ON "Campaign"("workspaceId");
```

**Step 4: Add workspaceId Column to Mailbox**
```sql
ALTER TABLE "Mailbox" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'default-workspace';
ALTER TABLE "Mailbox" ADD CONSTRAINT "Mailbox_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
CREATE INDEX "Mailbox_workspaceId_idx" ON "Mailbox"("workspaceId");
```

**Step 5: Create Default Workspace**
```sql
INSERT INTO "Workspace" (id, name, plan, "createdAt", "updatedAt")
VALUES ('default-workspace', 'Default Workspace', 'free', NOW(), NOW())
ON CONFLICT DO NOTHING;
```

### Option A: Prisma Migrate (Recommended)
```bash
cd nexus-outbound
npx prisma migrate deploy
```

Prisma will:
1. Create the migrations directory
2. Generate SQL from schema changes
3. Apply migrations to database
4. Update Prisma Client types

### Option B: Manual SQL (If Prisma Migrate Fails)
Run the SQL commands above directly in Supabase SQL Editor:
1. Go to Supabase Dashboard → SQL Editor
2. Paste each SQL command
3. Execute in order
4. Run `npx prisma generate` to update types

---

## 🧪 VERIFICATION CHECKLIST

After migration is applied, run these checks:

### Database Schema
```sql
-- Check Workspace table exists
SELECT * FROM information_schema.tables WHERE table_name = 'Workspace';

-- Check User has workspaceId column
SELECT * FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'workspaceId';

-- Check Campaign has workspaceId column
SELECT * FROM information_schema.columns WHERE table_name = 'Campaign' AND column_name = 'workspaceId';

-- Check Mailbox has workspaceId column
SELECT * FROM information_schema.columns WHERE table_name = 'Mailbox' AND column_name = 'workspaceId';
```

### Data Verification
```sql
-- Verify default-workspace exists
SELECT * FROM "Workspace" WHERE id = 'default-workspace';

-- Verify all users have workspaceId
SELECT COUNT(*) as users_with_workspace FROM "User" WHERE "workspaceId" IS NOT NULL;

-- Verify all campaigns have workspaceId
SELECT COUNT(*) as campaigns_with_workspace FROM "Campaign" WHERE "workspaceId" IS NOT NULL;

-- Test: User A should see User B's campaigns (same workspace)
SELECT c.* FROM "Campaign" c
WHERE c."workspaceId" = (SELECT "workspaceId" FROM "User" WHERE email = 'user-a@example.com')
ORDER BY c."createdAt" DESC;
```

---

## 🧑‍💻 TESTING FLOW

### Test 1: Same User, Different Devices
```
Device 1:
  1. Login as Snehal
  2. Create "Health Wellness" campaign
  3. See it in UI ✓

Device 2:
  1. Login as Snehal
  2. See "Health Wellness" from Device 1 ✓
```

### Test 2: Team Members See Each Other
```
Workspace: Snehal's Team
  1. Login as Snehal
  2. Create "Campaign A"
  
  3. Login as Other Team Member
  4. Can see "Campaign A" created by Snehal ✓
  5. Create "Campaign B"
  
  6. Login as Snehal again
  7. Can see "Campaign B" created by Other Team Member ✓
```

### Test 3: Master Sees All
```
Master Account:
  1. Login as Master
  2. Can see ALL campaigns from ALL workspaces ✓
  3. Can delete campaigns ✓
  4. Can manage any workspace ✓
```

### Test 4: Workspace Isolation
```
Workspace A (Team 1):
  - User A (TEAM_MEMBER)
  - Campaign X
  
Workspace B (Team 2):
  - User B (TEAM_MEMBER)
  - Campaign Y

Test:
  - User A cannot see Campaign Y ✓
  - User B cannot see Campaign X ✓
```

---

## 📋 FILES MODIFIED

| File | Changes | Status |
|------|---------|--------|
| `prisma/schema.prisma` | Added Workspace model, workspaceId fields | ✅ Done |
| `api/intelligence/campaigns.ts` | Updated queries to use workspaceId | ✅ Done |
| `server/scope.ts` | Added workspaceId to DataScope | ✅ Done |
| `server/auth.ts` | Added workspaceId to AuthUser | ✅ Done |

---

## 🔑 KEY POINTS

### Before Migration
- ❌ Team members can ONLY see their own campaigns
- ❌ Master query is unclear (depends on implementation)
- ❌ No workspace concept in database

### After Migration
- ✅ All team members see all campaigns in their workspace
- ✅ Master sees all campaigns across all workspaces
- ✅ Data properly isolated by workspace
- ✅ Ready for multi-tenant SaaS model

---

## ⏭️ NEXT STEPS

1. **Ensure Database is Reachable**
   - Check Supabase status
   - Verify DATABASE_URL and DIRECT_URL env vars
   - Test connection: `npx prisma db push --skip-generate`

2. **Run Migration**
   ```bash
   cd nexus-outbound
   npx prisma migrate deploy
   ```

3. **Verify Schema**
   - Check Supabase SQL Editor
   - Confirm all tables and columns exist

4. **Test End-to-End**
   - Login with team member account
   - Create campaign
   - Login with another team member
   - Verify they see the campaign
   - Verify master sees all campaigns

5. **Deploy to Production**
   - Commit schema and code changes
   - Run migrations on production database
   - Monitor for errors
   - Test all workflows

---

## 🆘 TROUBLESHOOTING

### Migration Fails: Foreign Key Constraint
**Problem:** `workspaceId` column references non-existent `Workspace` table  
**Solution:** Create `Workspace` table first, then add foreign keys

### Migration Fails: Default Value
**Problem:** Existing rows don't have `workspaceId` set  
**Solution:** ALTER TABLE with DEFAULT 'default-workspace', then create default workspace entry

### Users Still Can't See Team Campaigns
**Problem:** Workspaces not properly assigned  
**Solution:** 
1. Check `User.workspaceId` is populated
2. Check `Campaign.workspaceId` matches user's workspace
3. Verify API query filters by workspaceId

---

## 📞 SUPPORT

If migration fails:
1. Check Supabase logs for SQL errors
2. Verify DATABASE_URL is correct
3. Try manual SQL migration first
4. Check schema.prisma for syntax errors
5. Restart dev server: `npm run dev`

---

**Status: READY FOR DATABASE APPLICATION** ⚡

When database is reachable, run:
```bash
cd nexus-outbound
npx prisma migrate deploy
```

This will apply all workspace changes and fix team member visibility!

# 🔴 CRITICAL: WORKSPACE DATA MODEL FIX

**Root Cause:** Database schema missing workspace/team concept  
**Impact:** Team members can't see each other's data, master can't see team data properly  
**Severity:** CRITICAL - Requires database migration + code changes  
**Status:** Plan prepared for implementation

---

## 🔍 ROOT CAUSE ANALYSIS

### Current (Broken) Structure
```
User
├─ id (cuid)
├─ role (MASTER | TEAM_MEMBER)  ← Only way to group users!
├─ NO workspaceId ❌
└─ campaigns → Campaign[]

Campaign
├─ id (cuid)
├─ userId (String) → User
├─ NO workspaceId ❌
└─ leads → Lead[]

Result: Team members grouped by ROLE, not by WORKSPACE
```

### Problem Flow
```
Workspace A (Snehal's Team):
  ├─ User: Snehal (TEAM_MEMBER)
  ├─ User: Other Team Member (TEAM_MEMBER)
  └─ Campaigns: [Created by Snehal, Created by Other Team Member]

When User B (Snehal) queries:
  SELECT * FROM Campaign WHERE userId = $1
  Result: Only campaigns created by Snehal ❌
  
When Master queries:
  SELECT * FROM Campaign WHERE role = MASTER (wrong!)
  Result: Depends on how query is implemented ❓
```

---

## ✅ SOLUTION: ADD WORKSPACE MODEL

### Step 1: Create Workspace Model
```sql
model Workspace {
  id              String    @id @default(cuid())
  name            String
  email           String?   @unique
  stripeId        String?   @unique
  plan            String    @default("free") // free, pro, enterprise
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  users           User[]
  campaigns       Campaign[]
  mailboxes       Mailbox[]
  contacts        Contact[]
}
```

### Step 2: Add workspaceId to User
```sql
model User {
  id              String    @id @default(cuid())
  workspaceId     String    @default("default-workspace") // ← NEW
  workspace       Workspace @relation(fields: [workspaceId], references: [id])
  
  role            Role      @default(TEAM_MEMBER)
  // ... rest of fields
}
```

### Step 3: Add workspaceId to Campaign
```sql
model Campaign {
  id              String    @id @default(cuid())
  workspaceId     String    @default("default-workspace") // ← NEW
  workspace       Workspace @relation(fields: [workspaceId], references: [id])
  
  userId          String    // Still track creator
  user            User      @relation(fields: [userId], references: [id])
  // ... rest of fields
}
```

### Step 4: Add workspaceId to Mailbox
```sql
model Mailbox {
  id              String    @id @default(cuid())
  workspaceId     String    @default("default-workspace") // ← NEW
  workspace       Workspace @relation(fields: [workspaceId], references: [id])
  
  userId          String    // Still track owner
  user            User      @relation(fields: [userId], references: [id])
  // ... rest of fields
}
```

---

## 🔧 NEW QUERIES (After Fix)

### Team Member: View Their Workspace's Campaigns
```sql
SELECT c.* FROM Campaign c
WHERE c.workspaceId = $1  -- User's workspace
ORDER BY c.createdAt DESC
```

**Result:**
- ✅ Sees campaigns from all team members in their workspace
- ✅ Sees campaigns created by themselves
- ✅ Can't see other workspaces' campaigns

---

### Master: View All Workspaces
```sql
SELECT c.* FROM Campaign c
ORDER BY c.createdAt DESC
```

**Result:**
- ✅ Sees all campaigns from all workspaces
- ✅ Can manage any workspace

---

## 📊 FIXED FLOW

### Workspace A (Snehal's Team)
```
Workspace: workspace_a
├─ User: Snehal (TEAM_MEMBER, workspace_a)
├─ User: Team Member 2 (TEAM_MEMBER, workspace_a)
├─ Campaign: "Campaign 1" (creator: Snehal, workspace_a)
└─ Campaign: "Campaign 2" (creator: Team Member 2, workspace_a)

When Snehal queries:
  SELECT * FROM Campaign 
  WHERE workspaceId = 'workspace_a'
  Result: [Campaign 1, Campaign 2] ✅

When Team Member 2 queries:
  SELECT * FROM Campaign 
  WHERE workspaceId = 'workspace_a'
  Result: [Campaign 1, Campaign 2] ✅
```

---

## 🚀 IMPLEMENTATION STEPS

### Phase 1: Database Migration
```
1. Create Prisma migration:
   npx prisma migrate dev --name add_workspace_model
   
2. Update schema.prisma with:
   - Workspace model
   - workspaceId fields in User, Campaign, Mailbox
   - Relationships back to Workspace
   
3. Run migration:
   npx prisma migrate deploy
```

### Phase 2: API Code Updates
```
1. Update GET /campaigns query:
   OLD: WHERE userId = $1
   NEW: WHERE workspaceId = userWorkspaceId
   
2. Update POST /campaigns:
   Add workspaceId from user's workspace
   
3. Update DELETE /campaigns:
   Verify workspaceId matches (security)
   
4. Update Mailbox queries similarly
```

### Phase 3: Frontend Updates
```
1. Ensure frontend passes workspaceId with requests
2. React Query caches should be workspace-aware
3. localStorage keys include workspaceId
```

---

## 🧪 TEST CASES

### Test 1: Team Member Views Workspace
```
Workspace A:
  - User: Snehal (TEAM_MEMBER)
  - Campaign: "Health Wellness" (by Snehal)

Workspace A:
  - User: Another Member (TEAM_MEMBER)
  
When Another Member logs in:
  - Can see "Health Wellness" ✅
```

### Test 2: Master Sees All
```
Workspace A: Campaign 1, Campaign 2
Workspace B: Campaign 3, Campaign 4

When Master logs in:
  - Can see all 4 campaigns ✅
```

### Test 3: Workspace Isolation
```
Workspace A: User 1 (TEAM_MEMBER)
Workspace B: User 2 (TEAM_MEMBER)

User 1 cannot see Workspace B campaigns ✅
```

---

## 📋 FILES TO CHANGE

### Database
```
nexus-outbound/prisma/schema.prisma
├─ Add Workspace model
├─ Add workspaceId to User
├─ Add workspaceId to Campaign
└─ Add workspaceId to Mailbox
```

### Backend API
```
api/intelligence/campaigns.ts
├─ Line 215: Change WHERE clause to use workspaceId
├─ Line 153: Add workspaceId on campaign creation
└─ Similar changes for other endpoints
```

### Backend Scope
```
server/scope.ts
├─ Add workspaceId to scope object
├─ Derive from user's workspace
└─ Pass through all API handlers
```

### Frontend
```
web/src/lib/api/...
├─ Update query filters to include workspaceId
├─ Update localStorage keys to include workspaceId
└─ Update React Query cache invalidation
```

---

## ⏱️ TIMELINE

| Phase | Effort | Time |
|-------|--------|------|
| Schema design | 1h | Quick |
| Migration creation | 30m | Quick |
| API updates | 2h | Medium |
| Frontend updates | 1h | Medium |
| Testing | 1h | Medium |
| **TOTAL** | **5.5h** | **Medium** |

---

## 🎯 PRIORITY

**CRITICAL** - Without this fix:
- ❌ Team members can't see each other's data
- ❌ Master can't properly manage team workspaces
- ❌ System is unusable for teams

**This MUST be fixed before shipping.**

---

## ✨ AFTER IMPLEMENTATION

✅ Team members see all workspace campaigns  
✅ Master sees all campaigns across workspaces  
✅ Data properly isolated by workspace  
✅ Scalable to multiple workspaces/organizations  
✅ Supports SaaS multi-tenant model  

---

**Status: READY TO IMPLEMENT** ⚡

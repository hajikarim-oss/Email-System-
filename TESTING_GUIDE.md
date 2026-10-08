# 🧪 TESTING GUIDE - EMAIL SYSTEM 101

**Status:** Ready for team testing  
**Date:** 2026-10-08  
**Database:** Migration applied and verified  

---

## 🚀 QUICK START

### Prerequisites
1. Backend running on port 3000
2. Frontend running on port 5173
3. Database migrated (✅ completed)
4. Have test user accounts ready

---

## ✅ TEST 1: Verify Login Works

**Purpose:** Confirm login 500 error is fixed

```bash
# Test login API
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "your-password"
  }'

# Expected Response: 200 OK with session token
```

### Frontend Test

Open http://localhost:5173 and login with test account.  
Expected: Login succeeds, no 500 error.

---

## ✅ TEST 2: Create Test Teams

### Create Team via Database

```javascript
// scripts/seed-teams.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const team = await prisma.team.create({
    data: {
      name: "Snehal's Team",
      description: "Test team for campaign visibility"
    }
  });
  console.log('Created team:', team);
}

main().then(() => process.exit(0));
```

```bash
node scripts/seed-teams.js
```

### Assign Users to Team

```javascript
async function assignUsers() {
  const users = await prisma.user.findMany({
    where: { role: 'TEAM_MEMBER' },
    take: 3
  });
  
  const team = await prisma.team.findFirst({
    where: { name: "Snehal's Team" }
  });
  
  for (const user of users) {
    await prisma.userTeam.create({
      data: { userId: user.id, teamId: team.id }
    });
    console.log(`Assigned ${user.email} to team`);
  }
}
```

---

## ✅ TEST 3: Verify Campaign Visibility

### Test 1: Team Member Sees Team Campaigns

```bash
# Login as User1
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user1@example.com", "password": "..."}' | jq -r '.token')

# Get campaigns
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/campaigns

# Expected: See campaigns from all team members
```

### Test 2: Non-Team User Cannot See

```bash
# Login as User4 (not in team)
curl -H "Authorization: Bearer $TOKEN4" \
  http://localhost:3000/api/campaigns

# Expected: Empty array or only own campaigns
```

### Test 3: Master Sees Everything

```bash
# Login as MASTER user
curl -H "Authorization: Bearer $MASTER_TOKEN" \
  http://localhost:3000/api/campaigns

# Expected: All campaigns from all teams
```

---

## ✅ TEST 4: Multi-Device Sync

**Purpose:** Verify campaigns sync instantly across devices

1. Open campaign list in two browser tabs
2. Both logged in as same user
3. Create new campaign in Tab 1
4. Tab 2 should show new campaign within 2 seconds
5. Expected: No manual refresh needed (cache disabled)

---

## ✅ TEST 5: Lead Import Flow (2,000 Leads)

```bash
# Create campaign
curl -X POST http://localhost:3000/api/campaigns \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "2K Lead Test", "timezone": "Asia/Kolkata"}'

# Add 2,000 leads and start campaign
curl -X POST http://localhost:3000/api/campaigns/{id}/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"leads": [...2000 leads...], "mailbox_id": "..."}'

# Expected:
# - Campaign status: RUNNING
# - All 2,000 leads imported to Smartlead
# - Sending starts at 50 leads/day
# - Timeline: 40 days to complete
```

### Verify in Smartlead
1. Open Smartlead dashboard
2. Check campaign shows 2,000 leads
3. Verify status is RUNNING
4. Check daily send rate is ~50 emails

---

## ✅ TEST 6: Authorization Validation

```bash
# Try to access User1's campaign as User4 (different team)
curl -H "Authorization: Bearer $TOKEN4" \
  http://localhost:3000/api/campaigns/$CAMPAIGN_ID

# Expected: 403 Forbidden or campaign not returned
```

---

## 📊 TEST SUMMARY CHECKLIST

| Test | Expected | Status |
|------|----------|--------|
| Login works (no 500) | ✅ Success | [ ] |
| Teams can be created | ✅ Success | [ ] |
| Users assigned to team | ✅ Success | [ ] |
| Team sees team campaigns | ✅ Visible | [ ] |
| Non-team sees own only | ✅ Hidden | [ ] |
| Master sees all | ✅ All visible | [ ] |
| Multi-device sync instant | ✅ <2s sync | [ ] |
| 2K leads imported | ✅ 2,000 added | [ ] |
| Leads sending at 50/day | ✅ Active | [ ] |
| Unauthorized blocked | ✅ 403 | [ ] |

---

## 🐛 TROUBLESHOOTING

### "Cannot find UserTeam table"
```bash
cd nexus-outbound
npx prisma db push
```

### "Campaign visibility not working"
1. Check users assigned: `SELECT * FROM "UserTeam"`
2. Check teams exist: `SELECT * FROM "Team"`
3. Review API logs

### "Multi-device sync slow"
1. Verify no cache: `curl -i http://localhost:3000/api/campaigns | grep Cache`
2. Should show: `Cache-Control: public, max-age=0`

### "2K leads not importing"
1. Verify Smartlead API key
2. Check campaign status: `SELECT status FROM "Campaign"`
3. Verify mailbox configured

---

## ✅ SUCCESS CRITERIA

✅ Login works without 500 error  
✅ Teams created and users assigned  
✅ Team members see each other's campaigns  
✅ Non-team members blocked from team campaigns  
✅ Master sees all campaigns  
✅ Multi-device sync works instantly  
✅ 2K lead import works end-to-end  
✅ Unauthorized access blocked  
✅ No data loss or corruption  

**When all tests pass, the solution is production-ready! 🚀**


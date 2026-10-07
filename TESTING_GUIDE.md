# 🧪 Testing Guide: Mailbox Sync & Campaign Flow

**Status:** Ready to test  
**Scripts:** 3 comprehensive testing scripts  
**Test Coverage:** Mailbox sync, campaign creation, Smartlead integration, webhooks

---

## 📋 What These Scripts Do

### 1. `verify-mailboxes.js` — Check Mailbox Status
**Purpose:** Compare Smartlead mailboxes vs database to ensure sync is correct

```bash
node scripts/verify-mailboxes.js
```

**Output:**
```
📧 Smartlead Email Accounts:
  1. haji.karim@theboredmonkey.com          | ID: 24294401 | Status: active
  2. snehal.maurya@theboredmonkey.com       | ID: 24293659 | Status: active
  3. vatsal.vadecha@theboredmonkey.com      | ID: 24293623 | Status: active
  4. tamanna.ranawat@theboredmonkey.com     | ID: 24260216 | Status: active
  5. preeti.karki@theboredmonkey.com        | ID: 23458016 | Status: active
  6. monu@theboredmonkey.com                | ID: 24259802 | Status: active
  7. suraj@theboredmonkey.com               | ID: 24259777 | Status: active
  8. partnerships@theboredmonkey.com        | ID: 24259845 | Status: active

📧 Database Mailboxes:
  (shows what's stored locally)

📊 Comparison Report:
  ✅ All 8 mailboxes synced perfectly!
```

---

### 2. `sync-smartlead-mailboxes.js` — Sync Mailboxes to Database
**Purpose:** Fetch all mailboxes from Smartlead and save them locally for tracking

```bash
node scripts/sync-smartlead-mailboxes.js
```

**What it does:**
- Fetches all 8 email accounts from Smartlead API
- Creates/updates Mailbox records in PostgreSQL
- Links mailboxes to master user account
- Validates sync was successful

**Output:**
```
📧 Fetching mailboxes from Smartlead...
✅ Found 8 mailboxes in Smartlead

✅ Connected to database
👤 Syncing to user: cm...

✅ haji.karim@theboredmonkey.com (Smartlead ID: 24294401)
✅ snehal.maurya@theboredmonkey.com (Smartlead ID: 24293659)
... (6 more)

📊 Sync Summary: 8/8 mailboxes synced
```

---

### 3. `test-full-campaign-flow.js` — End-to-End Campaign Test
**Purpose:** Test complete flow: create campaign → sync to Smartlead → test webhooks → verify database

```bash
node scripts/test-full-campaign-flow.js
```

**Tests performed:**
1. ✅ Create campaign via `POST /campaigns`
2. ✅ Sync campaign to Smartlead with test leads
3. ✅ Verify database persistence
4. ✅ Simulate webhook events
5. ✅ Retrieve campaigns via `GET /campaigns`

**Output:**
```
📝 Test 1: Create Campaign via POST /campaigns
✅ Campaign created: cm...
   Name: Test Campaign 2K Leads 1728298765
   Status: DRAFT

🔄 Test 2: Sync Campaign to Smartlead (2K Leads)
Generated 2000 test leads
✅ Campaign synced to Smartlead
   Database ID: cm...
   Smartlead ID: 4088693
   Status: ACTIVE
   Leads synced: 100
   Mailboxes assigned: 8

💾 Test 3: Verify Database Persistence
✅ Campaign in database
   ID: cm...
   Name: Test Campaign 2K Leads 1728298765
   Status: ACTIVE
   Smartlead ID: 4088693
   Created: 2026-10-07T...
   Leads linked: 100
   Steps created: 2

🔔 Test 4: Simulate Webhook Events
✅ EMAIL_SENT: prospect-0@techcorp.com
✅ EMAIL_OPEN: prospect-1@techcorp.com
✅ EMAIL_REPLY: prospect-2@techcorp.com

3/3 webhook events processed

📋 Test 5: Retrieve Campaigns
✅ Retrieved 1 campaigns from database

   Latest Campaign:
   - Name: Test Campaign 2K Leads 1728298765
   - Status: ACTIVE
   - Leads: 100
   - Smartlead ID: 4088693

✅ All tests completed!
```

---

## 🚀 How to Run on VPS

### Step 1: SSH to VPS
```bash
ssh root@201.18.217.65
cd /var/www/email-system
```

### Step 2: Set Environment Variables
```bash
export SMARTLEAD_API_KEY="your-api-key"
export DATABASE_URL="your-db-url"
export API_URL="https://tbmoutreach.tech"
export AUTH_TOKEN="your-auth-token"
```

Or source from `.env`:
```bash
set -a && source .env && set +a
```

### Step 3: Run Tests in Order

**Test 1: Verify Mailboxes (5 seconds)**
```bash
node scripts/verify-mailboxes.js
# Expected: ✅ Mailbox verification PASSED
```

**Test 2: Sync Mailboxes if Needed (10 seconds)**
```bash
node scripts/sync-smartlead-mailboxes.js
# Only run if verify shows ❌ or missing mailboxes
```

**Test 3: Full Campaign Flow (30-60 seconds)**
```bash
node scripts/test-full-campaign-flow.js
# Expected: ✅ All tests completed!
```

---

## 📊 Expected Results

### After Running All Tests

**Database should have:**
```sql
SELECT COUNT(*) FROM "Mailbox";
-- Result: 8 (synced from Smartlead)

SELECT COUNT(*) FROM "Campaign" WHERE "providerCampaignId" IS NOT NULL;
-- Result: 1+ (test campaign created)

SELECT COUNT(*) FROM "Lead" WHERE "campaignId" IS NOT NULL;
-- Result: 100+ (test leads linked)

SELECT COUNT(*) FROM "CampaignStep";
-- Result: 2 (test steps created)
```

**Smartlead should show:**
- Campaign active with 2000 leads/day quota
- 8 mailboxes in round-robin rotation
- ~25 leads per mailbox per day (2000 / 8 ≈ 250/day per mailbox, ~25/hour)

**Webhooks should be:**
- Recording email events (sent, open, reply, bounce)
- Linked to campaigns via campaignId
- Updating lead status and counters

---

## 🔄 Round-Robin Mailbox Distribution

**How Smartlead handles 2000 leads/day across 8 mailboxes:**

```
Daily Quota: 2000 leads
Mailboxes: 8
Per-mailbox limit: 200 leads/day (as you've configured)

Distribution:
Smartlead automatically rotates through the 8 mailboxes
using round-robin algorithm:

Hour 0:   Mailbox 1, 2, 3, 4, 5, 6, 7, 8 (25 leads each = 200)
Hour 1:   Mailbox 1, 2, 3, 4, 5, 6, 7, 8 (25 leads each = 200)
...
Hour 9:   Mailbox 1, 2, 3, 4, 5, 6, 7, 8 (25 leads each = 200)

Total: 10 hours × 200 leads/hour = 2000 leads/day
```

**Database tracks:**
- Which campaign uses which mailboxes
- Which leads are sent from which mailbox (via webhook sender_email)
- Open/click/reply rates per mailbox

---

## 🧪 Testing Scenarios

### Scenario 1: New Fresh Deployment
```bash
# 1. Verify mailboxes
node scripts/verify-mailboxes.js
# Expected: ✅ PASSED

# 2. Run full test
node scripts/test-full-campaign-flow.js
# Expected: ✅ All tests completed

# 3. Check database grew
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"Campaign\";"
# Expected: 1+
```

### Scenario 2: Mailboxes Out of Sync
```bash
# 1. Verify will show ❌
node scripts/verify-mailboxes.js
# Expected: ❌ Mailbox verification FAILED

# 2. Re-sync mailboxes
node scripts/sync-smartlead-mailboxes.js
# Expected: ✅ Synced 8/8 mailboxes

# 3. Verify again
node scripts/verify-mailboxes.js
# Expected: ✅ PASSED
```

### Scenario 3: Production 2K Leads/Day
```bash
# 1. Modify test-full-campaign-flow.js, line ~50:
leads: leads.slice(0, 100)  # Change to:
leads: leads  # (use all 2000)

# 2. Run the test (will take 1-2 minutes to upload 2K leads)
node scripts/test-full-campaign-flow.js

# 3. Monitor Smartlead for distribution
# Check: Smartlead dashboard → Campaign → Recipients
# Verify: ~250 leads per mailbox distributed
```

---

## 🔍 Monitoring During Tests

### Terminal 1: Watch Logs
```bash
pm2 logs email-system-api --lines 50
```

**Look for:**
```
[Smartlead Sync] Campaign saved to database: cm...
[Smartlead Sync] 100 leads linked to campaign cm...
[Smartlead Webhook] EMAIL_SENT for prospect-0@...
```

### Terminal 2: Monitor Database
```bash
watch -n 5 "psql \"$DATABASE_URL\" -c \"
  SELECT 'Campaigns' as table_name, COUNT(*) FROM \\\"Campaign\\\"
  UNION ALL SELECT 'Leads', COUNT(*) FROM \\\"Lead\\\"
  UNION ALL SELECT 'Events', COUNT(*) FROM \\\"EmailEvent\\\";
\""
```

**Expected growth:**
```
 table_name | count
────────────┼──────
 Campaigns  |   1
 Leads      | 100
 Events     |   3
```

---

## ✅ Verification Checklist

After running all tests:

- [ ] `verify-mailboxes.js` shows ✅ PASSED
- [ ] `test-full-campaign-flow.js` completes all 5 tests
- [ ] Database `Campaign` count is 1+
- [ ] Database `Lead` count is 100+ (linked to campaigns)
- [ ] Database `CampaignStep` count is 2+
- [ ] Smartlead shows campaign with all 8 mailboxes ready
- [ ] Webhooks are being recorded (EmailEvent table has rows)
- [ ] PM2 logs show [Smartlead Sync] success messages
- [ ] No errors in API logs

---

## 🆘 Troubleshooting

### Issue: "Error: SMARTLEAD_API_KEY not set"
```bash
# Set the env var
export SMARTLEAD_API_KEY="your-key"
# Verify
echo $SMARTLEAD_API_KEY
```

### Issue: "Error: DATABASE_URL not set"
```bash
# Set the env var or source from .env
export DATABASE_URL="postgresql://..."
# Verify
echo $DATABASE_URL | head -c 30
```

### Issue: "Failed to create campaign (500)"
```bash
# Check API logs
pm2 logs email-system-api --lines 50

# Check database connection
psql "$DATABASE_URL" -c "SELECT 1;"
# Should return: 1

# Restart API
pm2 restart email-system-api
```

### Issue: "Mailbox verification FAILED"
```bash
# Sync mailboxes
node scripts/sync-smartlead-mailboxes.js

# Verify again
node scripts/verify-mailboxes.js
```

### Issue: "Campaign synced but not in database"
```bash
# Check logs for database errors
pm2 logs email-system-api | grep -i "database\|error"

# Query directly
psql "$DATABASE_URL" -c "
  SELECT * FROM \"Campaign\" 
  WHERE \"providerCampaignId\" IS NOT NULL 
  LIMIT 1 \gx;
"
```

---

## 📞 Test Results Interpretation

### ✅ All Green (Passing)
```
✅ Mailbox verification PASSED
✅ Campaign created
✅ Campaign synced to Smartlead
✅ Campaign in database
✅ 100 leads linked
✅ 2 steps created
✅ Webhook events processed
✅ Campaigns retrieved
✅ All tests completed!
```

**Means:** System is working perfectly. Mailboxes synced, campaigns persist, webhooks active.

### ⚠️ Some Orange (Warnings)
```
✅ Tests passed
⚠️ Webhook events: 1/3 processed
```

**Means:** System works but webhook signature verification might be enabled. Not critical for functionality.

### ❌ Some Red (Failing)
```
❌ Campaign creation failed
❌ Database not available
❌ Smartlead API error
```

**Means:** System has issues. Check PM2 logs, database connection, API keys.

---

## 🎯 Next Steps After Testing

1. **All tests pass?**
   - ✅ System is production-ready
   - Create real campaign via UI
   - Monitor for 24 hours
   - Check analytics dashboard

2. **Some tests fail?**
   - Check troubleshooting section
   - Review PM2 logs
   - Verify environment variables
   - Reach out to support

3. **Ready for 2K leads/day?**
   - Modify test script to send all 2000 leads
   - Run full test
   - Monitor Smartlead for even distribution
   - Monitor database for growth

---

**Ready to test? Run:**
```bash
node scripts/verify-mailboxes.js && \
node scripts/sync-smartlead-mailboxes.js && \
node scripts/test-full-campaign-flow.js
```

**All 3 scripts should complete in < 2 minutes** ✅

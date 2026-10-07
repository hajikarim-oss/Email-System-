# ✅ DEPLOYMENT CHECKLIST

**Status:** Ready for VPS Deployment  
**Commits:** 2 new commits pushed to GitHub  
**Branch:** main  

---

## 📦 What Was Fixed

### Core Issues (CRITICAL)
- [x] **Campaign Persistence** — Campaigns now saved to PostgreSQL after Smartlead creation
- [x] **POST /campaigns Handler** — Frontend can now create campaigns via API
- [x] **Database/Smartlead Sync** — Smartlead campaign ID linked to database record
- [x] **Lead Linkage** — Leads enrolled in Smartlead campaigns are linked via `campaignId` foreign key

### Code Changes Summary
- **2 files modified:** `api/smartlead/sync-and-start.ts` (+60 lines), `api/intelligence/campaigns.ts` (+82 lines)
- **2 scripts added:** Database and Smartlead diagnostic scripts
- **1 deployment guide:** Complete with pre/during/post deployment steps

---

## 🚀 Deployment to VPS

### Step 1: SSH to VPS
```bash
ssh root@201.18.217.65
cd /var/www/email-system
```

### Step 2: Pull Latest Code
```bash
git pull origin main
# Verify: git log --oneline -1 should show "docs: add deployment guide..."
```

### Step 3: Backup Database
```bash
# Export current database state
pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d_%H%M%S).sql

# Or via Supabase CLI
supabase db pull --db-url "$DATABASE_URL"
```

### Step 4: Install Dependencies
```bash
npm install
# or
pnpm install --frozen-lockfile
```

### Step 5: Reload PM2 Services
```bash
pm2 reload email-system-api
pm2 reload nexus-outbound
pm2 logs email-system-api --lines 20
```

### Step 6: Health Checks
```bash
# Check API server is running
curl http://localhost:3001/api/health
# Expected: {"status":"ok","uptime":...}

# Check frontend is running
curl http://localhost:3000/
# Expected: HTML response (Next.js)

# Check database connection
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"Campaign\";"
# Expected: 0 or higher (was 0 before, will grow now)
```

---

## 🧪 Validation Tests (Post-Deployment)

### Test 1: Create Campaign via API
```bash
curl -X POST "https://tbmoutreach.tech/api/campaigns" \
  -H "Authorization: Bearer $(echo 'your-auth-token')" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Campaign '"$(date +%s)"'",
    "timezone": "Asia/Kolkata",
    "status": "DRAFT"
  }'

# Expected: 201 Created with campaign object including "id" field
```

### Test 2: List Campaigns
```bash
curl "https://tbmoutreach.tech/api/campaigns" \
  -H "Authorization: Bearer $(echo 'your-auth-token')"

# Expected: 200 OK with array (should have at least 1 campaign now)
```

### Test 3: Check Database
```bash
psql "$DATABASE_URL" << 'SQL'
SELECT COUNT(*) as campaigns FROM "Campaign";
SELECT COUNT(*) as leads FROM "Lead" WHERE "campaignId" IS NOT NULL;
SELECT COUNT(*) as campaign_steps FROM "CampaignStep";
SQL

# Expected: campaigns > 0 (was 0 before)
```

### Test 4: End-to-End via UI
1. Open https://tbmoutreach.tech
2. Navigate to "Create Campaign"
3. Fill in campaign name and details
4. Click "Create"
5. Verify:
   - No errors in browser console
   - Campaign appears in dashboard
   - Can see campaign details

### Test 5: Smartlead Sync-and-Start
```bash
curl -X POST "https://tbmoutreach.tech/api/smartlead/sync-and-start" \
  -H "Authorization: Bearer $(echo 'your-auth-token')" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sync Test Campaign '"$(date +%s)"'",
    "leads": [
      {"email": "test+1@example.com", "first_name": "John", "last_name": "Doe"},
      {"email": "test+2@example.com", "first_name": "Jane", "last_name": "Smith"}
    ],
    "steps": [
      {"subject": "Hello {{first_name}}", "body_html": "<p>Hi {{first_name}},</p><p>Testing the fix.</p>"}
    ],
    "timezone": "Asia/Kolkata"
  }'

# Expected: 200 OK
# {
#   "ok": true,
#   "id": "cm...",              ← Database campaign ID (NEW!)
#   "smartlead_id": 4088693,
#   "status": "ACTIVE",
#   "leads_count": 2
# }

# Verify leads were created:
psql "$DATABASE_URL" -c "
  SELECT l.email, c.name, c.\"providerCampaignId\"
  FROM \"Lead\" l
  JOIN \"Campaign\" c ON l.\"campaignId\" = c.id
  WHERE c.name LIKE 'Sync Test Campaign%'
  LIMIT 5;
"
# Expected: 2 rows with emails and campaign name
```

---

## 🔍 Monitoring After Deployment

### Watch Logs
```bash
# Follow API logs in real-time
pm2 logs email-system-api

# Look for these success patterns:
# [Smartlead Sync] Campaign saved to database: cm...
# [Smartlead Sync] X leads linked to campaign cm...
```

### Track Campaign Growth
```bash
# Run every 5 minutes to verify growth
watch -n 5 "psql \"$DATABASE_URL\" -c \"SELECT 'Campaigns' as table_name, COUNT(*) as count FROM \\\"Campaign\\\" 
UNION ALL SELECT 'Leads with campaigns', COUNT(*) FROM \\\"Lead\\\" WHERE \\\"campaignId\\\" IS NOT NULL;\""
```

### Error Alerts
```bash
# Search for errors in logs
pm2 logs email-system-api | grep -i "error\|fail\|exception"

# If you see errors, check:
# 1. Database connection: psql "$DATABASE_URL" -c "SELECT 1"
# 2. Smartlead API: curl "https://server.smartlead.ai/api/v1/email-accounts?api_key=$SMARTLEAD_API_KEY"
# 3. PM2 status: pm2 status
```

---

## ⚠️ Rollback (If Critical Issues)

If deployment causes severe issues:

```bash
# Option 1: Revert code to previous commit
git revert c0d4a77
git push origin main
pm2 reload email-system-api

# Option 2: Reset hard to previous state
git reset --hard ec8fbfd^
git push origin main --force-with-lease
pm2 reload email-system-api

# Option 3: Restore database from backup
psql "$DATABASE_URL" < backup_20261007_120000.sql
```

---

## 📋 Sign-Off Checklist

- [ ] Code pulled to VPS (`git log --oneline -1` shows latest commits)
- [ ] Database backed up (file or Supabase export created)
- [ ] PM2 services reloaded (`pm2 status` shows all green)
- [ ] Health checks pass (API responds, frontend loads)
- [ ] Database query shows campaigns exist (`COUNT(*) > 0`)
- [ ] POST /campaigns tested and returns 201
- [ ] GET /campaigns tested and returns campaign list
- [ ] sync-and-start tested and returns campaign ID
- [ ] Browser UI tested (campaign creation works)
- [ ] Logs monitored for errors (no critical errors)
- [ ] Team notified of deployment

---

## 📞 Troubleshooting

### Issue: "Error: campaign_name_taken" (409)
**Cause:** Campaign name already exists for this user  
**Fix:** Use a different campaign name or delete the old campaign first

### Issue: "Error: database_persistence_failed" (500)
**Cause:** Database INSERT failed after Smartlead campaign created  
**Fix:**
```bash
# Check database connection
psql "$DATABASE_URL" -c "SELECT version();"

# Check PM2 logs for details
pm2 logs email-system-api --lines 50

# Restart database connection
pm2 restart email-system-api
```

### Issue: "Error: database_unavailable" (503)
**Cause:** Database connection pool exhausted  
**Fix:**
```bash
# Check Supabase status
curl "https://status.supabase.com/api/v2/status.json"

# Restart API server (reconnects pool)
pm2 restart email-system-api

# Check connection count
psql "$DATABASE_URL" -c "SELECT count(*) FROM pg_stat_activity;"
```

### Issue: Campaign created but doesn't appear in UI
**Cause:** Frontend caching or need to refresh  
**Fix:**
```bash
# Hard refresh browser: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

# Or check if campaign was actually created in DB:
psql "$DATABASE_URL" -c "SELECT * FROM \"Campaign\" ORDER BY \"createdAt\" DESC LIMIT 1;"
```

### Issue: Leads in Smartlead but not showing in database
**Cause:** Lead linkage failed silently (non-critical error)  
**Fix:**
```bash
# Check logs for warnings
pm2 logs email-system-api | grep -i "lead linkage warning"

# Manual sync (recreate leads in database)
# Query Smartlead for campaign leads, then INSERT into database
```

---

## 📞 Support

**Questions about the fix?**  
See: `DEPLOYMENT_GUIDE_FIX.md` (detailed technical guide)  
See: `AUDIT_REPORT.md` (forensic analysis of root causes)

**Need to revert?**  
Use "Rollback" section above.

**Deployment stuck?**  
Check PM2 logs: `pm2 logs email-system-api --lines 100`

---

**Deployment Date:** _______________  
**Deployed By:** _______________  
**Verified By:** _______________  
**Notes:** _______________

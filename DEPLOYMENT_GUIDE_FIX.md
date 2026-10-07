# 🚀 Deployment Guide: Campaign Persistence Fixes

**Commit:** `ec8fbfd` - fix: implement complete campaign persistence and database sync  
**Date:** 2026-10-07  
**Priority:** CRITICAL (Production Blocker Fix)

---

## 📋 Summary

This deployment fixes **4 critical production failures**:
1. ✅ New campaigns now persisted to PostgreSQL database
2. ✅ POST /campaigns handler implemented for frontend creation
3. ✅ Campaign creation now stores Smartlead ID for future syncing
4. ✅ Leads enrolled in Smartlead campaigns are now linked to database records

**Impact:** Users can now create campaigns through the UI and see them in the dashboard.

---

## 🔧 What Changed

### Files Modified
- `api/smartlead/sync-and-start.ts` (+60 lines)
  - Added database persistence after Smartlead campaign creation
  - Added lead linkage to database
  - Removed hardcoded campaign ID fallback
  - Improved campaign creation logic (check for existing first)

- `api/intelligence/campaigns.ts` (+82 lines)
  - Implemented POST /campaigns handler
  - Full campaign creation workflow with validation
  - Campaign step creation
  - Proper error handling (409 for duplicates, 503 for DB errors)

### Scripts Added
- `scripts/db_audit.js` - Database diagnostic script
- `scripts/smartlead_audit.js` - Smartlead API diagnostic script

---

## 📖 Pre-Deployment Checklist

- [ ] Backup Supabase database
  ```bash
  # Via Supabase CLI
  supabase db pull
  
  # Or via pg_dump
  pg_dump "$DATABASE_URL" > backup_$(date +%s).sql
  ```

- [ ] Test in staging environment first (if available)

- [ ] Verify API server logs are being monitored
  ```bash
  pm2 logs email-system-api --lines 50
  ```

- [ ] Ensure Smartlead API keys are valid
  ```bash
  curl "https://server.smartlead.ai/api/v1/email-accounts?api_key=$SMARTLEAD_API_KEY"
  ```

---

## 🚀 Deployment Steps

### Step 1: Pull Latest Code
```bash
cd /path/to/Email-System-101
git pull origin main
# Verify commit: git log --oneline -1 should show "ec8fbfd"
```

### Step 2: Install Dependencies (if needed)
```bash
npm install
# or
pnpm install
```

### Step 3: Restart API Server
```bash
pm2 restart email-system-api
pm2 logs email-system-api --lines 20
```

### Step 4: Verify Deployment

**Test 1: Campaign Creation**
```bash
curl -X POST "https://tbmoutreach.tech/api/campaigns" \
  -H "Authorization: Bearer $YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Campaign Created at $(date +%s)",
    "timezone": "Asia/Kolkata",
    "status": "DRAFT"
  }'

# Expected Response: 201 Created
# {
#   "id": "cm...",
#   "userId": "...",
#   "name": "Test Campaign...",
#   "status": "DRAFT",
#   "providerCampaignId": null,
#   "createdAt": "2026-10-07T..."
# }
```

**Test 2: Database Persistence**
```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) as campaign_count FROM \"Campaign\";"
# Expected: campaign_count >= 1 (was 0 before fix)
```

**Test 3: Campaign Retrieval**
```bash
curl "https://tbmoutreach.tech/api/campaigns" \
  -H "Authorization: Bearer $YOUR_TOKEN"

# Expected Response: 200 OK with array of campaigns
```

**Test 4: sync-and-start (Smartlead Integration)**
```bash
curl -X POST "https://tbmoutreach.tech/api/smartlead/sync-and-start" \
  -H "Authorization: Bearer $YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Campaign Sync at $(date +%s)",
    "leads": [
      {"email": "test+1@example.com", "first_name": "John", "last_name": "Doe"}
    ],
    "steps": [
      {"subject": "Hello", "body_html": "<p>Hi {{first_name}}</p>"}
    ]
  }'

# Expected Response: 200 OK
# {
#   "ok": true,
#   "id": "cm...",              ← NEW: Database campaign ID
#   "smartlead_id": 4088693,    ← Smartlead campaign ID
#   "status": "ACTIVE",
#   "leads_count": 1
# }
```

**Test 5: Lead Linkage**
```bash
psql "$DATABASE_URL" -c "
  SELECT l.email, c.name, c.id as campaign_id
  FROM \"Lead\" l
  JOIN \"Campaign\" c ON l.\"campaignId\" = c.id
  WHERE c.\"providerCampaignId\" IS NOT NULL
  LIMIT 5;
"

# Expected: Leads linked to campaigns (not NULL campaignId)
```

---

## 📊 Post-Deployment Validation

### Check PM2 Logs
```bash
pm2 logs email-system-api --lines 100 | grep -E "\[Smartlead Sync\]|error|failed"
```

Expected output:
```
[Smartlead Sync] Campaign saved to database: cm...
[Smartlead Sync] X leads linked to campaign cm...
```

### Monitor Database Growth
```bash
watch "psql \"$DATABASE_URL\" -c \"SELECT 'Campaign' as table_name, COUNT(*) FROM \\\"Campaign\\\" 
UNION ALL SELECT 'Lead', COUNT(*) FROM \\\"Lead\\\" 
UNION ALL SELECT 'CampaignStep', COUNT(*) FROM \\\"CampaignStep\\\";\""
```

### Check Error Logs
```bash
pm2 logs email-system-api | grep -i "error\|warn"
```

### Browser Console Tests
1. Open https://tbmoutreach.tech
2. Create a new campaign via UI
3. Verify in browser Network tab:
   - POST /campaigns → 201 Created
   - POST /api/smartlead/sync-and-start → 200 OK with `"id": "..."`
4. Refresh page → campaign should appear in list

---

## 🔄 Rollback Plan (If Needed)

If critical issues occur:

```bash
# Revert to previous commit
git revert ec8fbfd
git push origin main

# Or revert entire commit
git reset --hard HEAD~1
git push origin main --force-with-lease

# Restart API
pm2 restart email-system-api
```

**Note:** Campaigns created after deployment cannot be rolled back from database automatically. Consider this when deciding to rollback.

---

## 📝 Known Limitations & Next Steps

### Phase 2 Improvements (Optional, Not Blocking)
- [ ] Campaign status sync (when Smartlead status changes, update DB)
- [ ] Webhook deduplication for duplicate event prevention
- [ ] Batch lead import optimization (currently one-by-one)
- [ ] Campaign archival/cleanup for old completed campaigns

### Monitoring Recommendations
- Add alerts for `/api/smartlead/sync-and-start` errors
- Monitor Campaign table growth rate
- Track Lead-Campaign orphaned records (leads with NULL campaignId)
- Set up email alerts for database persistence failures

### Performance Notes
- Lead enrollment uses one INSERT per lead (not batch)
  - OK for 1-100 leads, may want optimization for 1000+ leads
  - Can be improved in Phase 2 if needed

---

## 💬 Support & Troubleshooting

### "Error: campaign_name_taken"
- Campaign name already exists for this user
- Solution: Use different campaign name

### "Error: database_unavailable" (503)
- Database connection pool exhausted or database down
- Solution: Check Supabase status, restart PM2, check connection limits

### "Error: database_persistence_failed"
- Campaign created in Smartlead but failed to save to DB
- Check PM2 logs: `pm2 logs email-system-api`
- Verify database connection string in .env

### Campaign appears in Smartlead but not UI after 1 minute
- Leads may still be uploading (async process)
- Check: `SELECT COUNT(*) FROM "Campaign" WHERE "providerCampaignId" = 4088693`
- If count is 0 but command succeeded, check Smartlead API logs

### Webhooks not triggering after campaign created
- Verify webhook registered: Check sync-and-start logs for "Webhook check/register"
- Test webhook manually: `curl -X GET https://tbmoutreach.tech/api/webhooks/smartlead`
- Should return: `{"status":"active", ...}`

---

## 📞 Questions?

Review the forensic audit report in `AUDIT_REPORT.md` for complete technical details.

**Deployment Owner:** Haji Karim  
**Date Deployed:** [FILL IN]  
**Verified By:** [FILL IN]

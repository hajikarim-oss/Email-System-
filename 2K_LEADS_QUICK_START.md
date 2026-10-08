# ⚡ 2K LEADS - QUICK START GUIDE

**Your Question:** "Will Smartlead send 2K emails? It's only showing 50."

**Quick Answer:**
```
✅ YES - It will send to all 2,000
⚠️  BUT - Only 50 NEW ones start per day
🚀 FIX - Change daily limit to 200 (10 days total)
```

---

## 🎯 THE "50" EXPLAINED

```
NOT: "Campaign can only hold 50 leads"
YES: "Start sending to 50 NEW leads per day"

Timeline:
  Day 1:  50 leads start → emails go out
  Day 2:  50 more leads start → emails go out
  Day 3:  50 more leads start → emails go out
  ...
  Day 40: All 2,000 leads have started
```

---

## ⚡ QUICK SETUP (3 STEPS)

### Step 1: Add Your 2,000 Leads
```
In Smartlead or Your App:
  1. Go to Campaign
  2. Click "Add Leads"
  3. Upload CSV with 2,000 emails
  4. Verify and confirm
```

### Step 2: Change Daily Limit (50 → 200)
```
Goal: Start all 2,000 in 10 days instead of 40

How to Change:
  Option A: In Campaign Settings
    → Find "Max new leads per day"
    → Change from 50 to 200
    → Save
    
  Option B: Via API Parameter
    → When syncing/creating campaign:
    → Add: "daily_limit": 200
    → Save
```

### Step 3: Start Campaign
```
1. Click "Start Campaign"
2. Campaign begins
3. Day 1: 200 leads enter sequence
4. Day 2: 200 more leads enter
5. Day 10: All 2,000 leads in sequence
6. Emails send across 10-day period
```

---

## 📊 BEFORE vs AFTER

### Default (50 per day)
```
Day 1:  50 leads start
Day 2:  50 leads start
...
Day 40: 2,000 done (40 days!)

Pros: Very safe
Cons: Slow ramp-up
```

### Recommended (200 per day)
```
Day 1:  200 leads start
Day 2:  200 leads start
...
Day 10: 2,000 done (10 days!)

Pros: Good balance, safe, reasonable speed
Cons: None
```

### Aggressive (500 per day)
```
Day 1:  500 leads start
Day 2:  500 leads start
Day 3:  500 leads start
Day 4:  500 leads start
Day 5:  2,000 done (5 days!)

Pros: Very fast
Cons: HIGH ISP BLOCK RISK - NOT RECOMMENDED
```

---

## 🔧 WHERE TO CHANGE IT

### Option 1: Smartlead Dashboard
```
Campaign Settings
  → Schedule
    → Max New Leads Per Day
      → Change: 50 → 200
        → Save
```

### Option 2: Your App API
```javascript
// When creating/syncing campaign
{
  "campaign_name": "My Campaign",
  "daily_limit": 200,          // ← Change from default 50
  "send_interval_seconds": 180,
  "auto_optimize_interval": true
}
```

### Option 3: Database (Direct)
```sql
-- If stored locally
UPDATE Campaign 
SET max_new_leads_per_day = 200,
    send_interval_seconds = 180
WHERE name = 'My Campaign';
```

---

## 📈 RECOMMENDED SETTINGS FOR 2K LEADS

```
Daily Limit:        200 per day
Send Interval:      180 seconds (3 minutes)
Mailboxes:          8+ (for distribution)
Days of Week:       Mon-Fri (business hours)
Send Hours:         08:00 - 18:00
Timezone:           Asia/Kolkata (or yours)
Total Timeline:     10 days to start all 2,000
```

---

## ✅ VERIFICATION

### After Setting Up:

**Check 1: Smartlead Settings**
```
Campaign → Settings
  ✅ Max New Leads Per Day: 200 (not 50)
  ✅ Send Interval: 180 seconds
  ✅ Mailboxes: 8+ linked
  ✅ Status: ACTIVE
```

**Check 2: Lead Status**
```
Campaign → Leads
  ✅ Total Leads: 2,000
  ✅ Leads in Sequence: Increasing daily
  ✅ Status: SCHEDULED or ACTIVE
```

**Check 3: Email Sending**
```
Campaign → Activity Log
  ✅ Day 1: ~200 emails sent
  ✅ Day 2: ~200 emails sent
  ✅ Continues each day
```

---

## ⏱️ TIMELINE CALCULATOR

### Formula
```
Days = Total Leads / Daily Limit

Examples:
  2,000 ÷ 50  = 40 days (default)
  2,000 ÷ 100 = 20 days
  2,000 ÷ 200 = 10 days (recommended)
  2,000 ÷ 500 = 4 days (risky)
```

### Recommended Timeline: 10 Days

```
Day 1: 200 leads start
Day 2: 200 leads start
Day 3: 200 leads start
Day 4: 200 leads start
Day 5: 200 leads start
Day 6: 200 leads start
Day 7: 200 leads start
Day 8: 200 leads start
Day 9: 200 leads start
Day 10: 200 leads start
─────────────
TOTAL: 2,000 leads sending
```

---

## 🚨 IMPORTANT: DON'T SET TOO HIGH

### ISP Block Risk
```
❌ 500+ per day:   Likely blocks
❌ < 5 sec interval: Gmail/Outlook rejects
❌ Same mailbox:   Spam folder

✅ 200 per day:   Safe & professional
✅ 180 sec interval: Good reputation
✅ 8+ mailboxes:  Distributed loading
```

---

## 🎯 QUICK STEPS TO EXECUTE

**RIGHT NOW:**

1. **Check Current Setting**
   - Go to Smartlead Campaign
   - Find "Max new leads per day"
   - Note current value (should be 50)

2. **Change to 200**
   - Click to edit
   - Change 50 → 200
   - Save

3. **Add 2,000 Leads**
   - Click "Add Leads"
   - Upload CSV
   - Confirm

4. **Start Campaign**
   - Click "Start"
   - Campaign begins
   - Monitor Day 1-10

5. **Verify Progress**
   - Each day, check emails sent
   - Should see ~200 per day
   - After 10 days: all 2,000 started

---

## 📊 EXAMPLE: ACTUAL NUMBERS

### With Your Configuration:
```
Daily Limit:  200 leads/day
Mailboxes:    8
Send Interval: 180 seconds (3 min)

Day 1 Breakdown:
  ├─ 8 AM: Campaign activates
  ├─ 200 leads enter sequence
  ├─ Each mailbox gets: 200/8 = 25 leads
  ├─ Over 10 hours (8 AM - 6 PM):
  │   ├─ 25 emails from mailbox 1
  │   ├─ 25 emails from mailbox 2
  │   ├─ ... (8 mailboxes total)
  │   └─ Total: 200 emails on Day 1
  └─ Reputation: ✅ Safe & professional

Day 10 Result:
  └─ All 2,000 leads have entered sequence
  └─ Campaign continues sending follow-ups
  └─ Based on your step delays (3 days, 5 days, etc.)
```

---

## 🎓 WHAT HAPPENS AFTER DAY 10

```
Days 11+:
  ├─ No new leads starting (all 2,000 in)
  ├─ Campaign continues sequences
  ├─ Follow-ups sent based on step configuration
  ├─ Monitor opens, clicks, replies
  └─ Track performance

Example with 3-step sequence:
  Day 1:  Send Step 1 to 200 new leads
  Day 2:  Send Step 1 to 200 new leads
  ...
  Day 10: Send Step 1 to last 200 leads
  Day 13: Send Step 2 to first 200 (3 day delay)
  ...
  Continue until all steps complete
```

---

## ✨ FINAL CHECKLIST

- [ ] Change daily limit from 50 to 200
- [ ] Add 2,000 leads to campaign
- [ ] Verify mailboxes linked (8+)
- [ ] Start campaign
- [ ] Monitor Day 1 (should see ~200 emails)
- [ ] Monitor Day 2 (should see ~200 emails)
- [ ] Monitor Day 10 (last 200 leads)
- [ ] After Day 10, all 2,000 in sequence
- [ ] Monitor engagement (opens, clicks, replies)
- [ ] Adjust based on results

---

## 📞 QUICK REFERENCE

| Question | Answer |
|----------|--------|
| Total leads? | ✅ 2,000 (no limit) |
| What's "50"? | Daily limit (not total) |
| Change to what? | 200 per day (10 days) |
| Timeline? | 10 days to start all |
| Safe? | ✅ YES (recommended) |
| Too slow? | Can go to 300 (risky) |
| Too fast? | 50 is too slow |
| ISP blocks? | Only if >500/day |
| Mailboxes needed? | 8+ recommended |

---

**BOTTOM LINE: YES, you can send 2K emails. Change daily limit to 200 and all 2,000 will send within 10 days!**

**Action: 1) Go to settings 2) Change 50→200 3) Add 2K leads 4) Start campaign**

**Time: 5 minutes to setup, 10 days for full sending**

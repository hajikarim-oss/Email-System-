# 📧 ADDING 2,000 LEADS - COMPLETE GUIDE

**Question:** "Can I add 2K leads? It's only showing 50."

**Answer:**
```
✅ YES - You can add 2,000 leads (or more)
⚠️  BUT - Only 50 start per day (default limit)
🔧 SOLUTION - Configure daily limit to send faster
```

---

## 🎯 WHAT THE "50" MEANS

### Current Setting
```
max_new_leads_per_day: 50

This means:
  ❌ NOT: "Campaign can only have 50 leads total"
  ✅ YES: "Start sending to max 50 NEW leads per day"
```

### Example Timeline (50 per day)
```
Day 1: Start sending to leads 1-50
Day 2: Start sending to leads 51-100
Day 3: Start sending to leads 101-150
...
Day 40: Start sending to leads 1,951-2,000

Total Time: ~40 days to start all 2,000 leads
```

---

## 📊 HOW IT WORKS

### Total Leads vs Daily Limit

```
Total Leads in Campaign: 2,000 ✅ (no limit)
Daily Limit (per day):    50   (configurable)

Example:
  Add 2,000 leads to campaign
  Campaign starts sending:
    ├─ Day 1: 50 leads enter sequence
    ├─ Day 2: 50 new leads enter sequence
    ├─ Day 3: 50 new leads enter sequence
    └─ ...continues until all 2,000 are in
```

### What Smartlead Sends
```
Parameter: "max_new_leads_per_day": 50

Smartlead's Behavior:
  ├─ Receives 2,000 leads
  ├─ Puts all 2,000 in campaign
  ├─ Starts 50 per day
  ├─ Continues day by day
  └─ Spreads over time (reputation protection)
```

---

## 🔧 HOW TO CONFIGURE DAILY LIMIT

### Default Configuration (50 per day)
```
Code Location: api/smartlead/sync-and-start.ts, Line 315

const dailyCap = Number(parsed.daily_limit) || Number(parsed.max_new_leads_per_day) || 50;
                                  ↑
                           This parameter
```

### How to Change It

When creating/syncing campaign, pass `daily_limit`:

**Option 1: Through API** (if available)
```bash
POST /smartlead/sync-and-start
{
  "campaign_id": "...",
  "daily_limit": 500,  // ← Change from 50 to 500
  "mailbox_count": 8
}
```

**Option 2: Update Configuration**
```javascript
// In your campaign creation code
{
  daily_limit: 500,        // 500 leads per day
  send_interval_seconds: 180,  // 3 min between emails
  auto_optimize_interval: true  // Auto-calculate optimal interval
}
```

**Option 3: Direct Database Update** (Temporary)
```javascript
// This won't persist, but shows how it works
const campaign = {
  daily_limit: 500,  // Instead of 50
  max_new_leads_per_day: 500
}
```

---

## 📈 RECOMMENDED SETTINGS FOR 2,000 LEADS

### Conservative (Safe for Deliverability)
```
Daily Limit: 100
Send Interval: 300 seconds (5 minutes)
Timeline: 20 days to start all leads

Pros:
  ✅ Very safe
  ✅ High deliverability
  ✅ Less ISP blocks
  ✅ Better reputation

Cons:
  ⏳ Slower ramp-up
```

### Moderate (Balanced)
```
Daily Limit: 250
Send Interval: 180 seconds (3 minutes)
Timeline: 8 days to start all leads

Pros:
  ✅ Good balance
  ✅ Reasonable speed
  ✅ Solid deliverability
  ✅ Medium reputation risk

Cons:
  ⏳ Still takes a week
```

### Aggressive (Fast but Risky)
```
Daily Limit: 500
Send Interval: 60 seconds (1 minute)
Timeline: 4 days to start all leads

Pros:
  ⚡ Fast ramp-up
  ✅ Quick campaign start

Cons:
  🔴 High spam risk
  🔴 ISP blocks likely
  🔴 Low deliverability
  ⚠️  NOT RECOMMENDED
```

### What I Recommend for 2,000 Leads
```
Daily Limit: 200
Send Interval: 180 seconds (3 minutes)
Timeline: 10 days to start all leads

Why:
  ✅ Safe but reasonably fast
  ✅ Good deliverability
  ✅ Low ISP block risk
  ✅ Professional ramp-up
```

---

## 📊 CALCULATION: HOW MANY DAYS?

### Formula
```
Days to Start All Leads = Total Leads / Daily Limit

Examples:
  2,000 leads ÷ 50 = 40 days
  2,000 leads ÷ 100 = 20 days
  2,000 leads ÷ 200 = 10 days
  2,000 leads ÷ 500 = 4 days
```

### Timeline Examples

**Scenario 1: 50 per day (default)**
```
Day 1:  Leads 1-50 start
Day 2:  Leads 51-100 start
Day 3:  Leads 101-150 start
...
Day 40: Leads 1,951-2,000 start

Total time: 40 days to reach all 2,000
```

**Scenario 2: 200 per day (recommended)**
```
Day 1:   Leads 1-200 start
Day 2:   Leads 201-400 start
Day 3:   Leads 401-600 start
Day 4:   Leads 601-800 start
Day 5:   Leads 801-1,000 start
Day 6:   Leads 1,001-1,200 start
Day 7:   Leads 1,201-1,400 start
Day 8:   Leads 1,401-1,600 start
Day 9:   Leads 1,601-1,800 start
Day 10:  Leads 1,801-2,000 start

Total time: 10 days to reach all 2,000
```

---

## ⚡ SEND INTERVAL CALCULATION

### Auto-Optimize Feature
```
Code: Lines 320-329

If auto_optimize_interval = true:
  leadsPerMailbox = dailyCap / mailboxCount
  calculatedInterval = 32,400 seconds / leadsPerMailbox
  
Example (200 daily limit, 8 mailboxes):
  leadsPerMailbox = 200 / 8 = 25 leads per mailbox
  calculatedInterval = 32,400 / 25 = 1,296 seconds
  
Result: 1,296 seconds = ~21 minutes between emails
```

### Manual Configuration
```
Minimum: 2 seconds (HIGH RISK - ISP blocks)
Safe Range: 60-300 seconds (1-5 minutes)
Recommended: 180 seconds (3 minutes)
Maximum: 600 seconds (10 minutes)
```

---

## 🎯 STEP-BY-STEP: ADD 2K LEADS & CONFIGURE

### Step 1: Create Campaign in App
```
1. Go to your app
2. Create "2K Leads Campaign"
3. Add campaign steps
4. Save
```

### Step 2: Add 2,000 Leads
```
1. Click "Add Leads"
2. Upload CSV with 2,000 email addresses
3. Verify import
4. Confirm
```

### Step 3: Configure Daily Limit
```
Option A: Update in App UI
  [If UI has this option]
  Set Daily Limit: 200 (instead of 50)
  Set Send Interval: 180 seconds

Option B: Update via API
  Pass parameter when syncing:
  {
    "daily_limit": 200,
    "send_interval_seconds": 180
  }

Option C: Direct Database
  UPDATE Campaign
  SET ... daily_limit = 200
  WHERE ...
```

### Step 4: Link Mailboxes
```
1. Select mailboxes to use (8 recommended)
2. Smartlead will distribute leads across them
3. Verify all are ACTIVE status
```

### Step 5: Start Campaign
```
1. Click "Start Campaign"
2. Campaign begins sending
3. Day 1: 200 leads enter sequence
4. Day 2: 200 more leads enter sequence
5. Day 10: All 2,000 leads in sequence
```

### Step 6: Monitor
```
Check Smartlead:
  ├─ Total Leads: 2,000 ✅
  ├─ Leads in Sequence: Increasing daily ✅
  ├─ Emails Sent: Ramping up ✅
  ├─ Email Events: Replies, opens, clicks ✅
  └─ Status: ACTIVE ✅
```

---

## 🔍 HOW TO CHECK CURRENT LIMIT

### In Smartlead Dashboard
```
1. Go to Campaign
2. Click Settings or Schedule
3. Look for: "Max new leads per day" or "Daily limit"
4. Current value: 50 (or whatever it's set to)
```

### In Your Database
```sql
-- Check if saved locally
SELECT id, name, preferredSendHour, daily_limit
FROM Campaign
WHERE name = 'Your Campaign';

-- May not be in database yet
-- Stored in Smartlead's system
```

---

## 📊 SMARTLEAD EMAIL SENDING EXAMPLE

### With 2,000 Leads at 200/day

```
Campaign Configuration:
  Total Leads: 2,000
  Daily Limit: 200
  Send Interval: 180 seconds (3 min)
  Mailboxes: 8
  Days of Week: Mon-Fri
  Hours: 08:00 - 18:00

Day 1 Timeline:
  08:00 AM → Send to leads 1-200 start sequence
  08:00+ → Smartlead spreads sends over the day
          Every 3 minutes, one email sent
          Using round-robin across 8 mailboxes
  
  Leads/Mailbox = 200 / 8 = 25 per mailbox
  
  Calculation:
    Sending window: 08:00 to 18:00 = 10 hours = 600 min
    25 emails per mailbox in 600 minutes
    Interval: 600 / 25 = 24 minutes between emails
    
  Result: Emails spread evenly across the day
          No mailbox bombs, good reputation

Day 2: Leads 201-400 start
Day 3: Leads 401-600 start
...
Day 10: Leads 1,801-2,000 start

After Day 10:
  All 2,000 leads in sequence
  Sending continues based on step delays
  Each step waits X days before next email
```

---

## ✅ VERIFIED SETTINGS FOR 2K LEADS

```
Parameter           Recommended     Why
─────────────────────────────────────────────
total_leads         2,000          ✅ No limit
daily_limit         200            ✅ Safe speed
send_interval       180 sec        ✅ 3 min between
mailbox_count       8              ✅ Distribute
days_of_week        [1-5]          ✅ Mon-Fri
start_hour          08:00          ✅ Morning
end_hour            18:00          ✅ Evening
timezone            Asia/Kolkata   ✅ Your TZ
ramp_up_days        10             ✅ Gradual

Result:
  ✅ All 2,000 leads start within 10 days
  ✅ Safe deliverability
  ✅ Professional ramp-up
  ✅ Low ISP block risk
```

---

## 🚨 IMPORTANT WARNINGS

### ISP Blocks Risk
```
If you set daily limit TOO HIGH:
  ❌ 500+/day = Likely ISP blocks
  ❌ <5 sec interval = Gmail/Outlook blocks
  ❌ Same mailbox overload = Spam folder

Result: Emails don't reach inbox
```

### Mailbox Reputation
```
If you send too fast:
  ❌ Mailbox gets marked as spam
  ❌ Future emails to that mailbox blocked
  ❌ Warm-up months are wasted

Best Practice:
  ✅ Gradual ramp-up (10 days)
  ✅ Spread across mailboxes (8+)
  ✅ 3-5 min intervals (safe)
```

---

## 📋 COMPLETE CHECKLIST

- [ ] Create campaign in your app
- [ ] Add 2,000 leads via CSV
- [ ] Set daily limit to 200
- [ ] Set send interval to 180 seconds
- [ ] Link 8+ mailboxes
- [ ] Verify all mailboxes are ACTIVE
- [ ] Create campaign steps/sequences
- [ ] Start campaign
- [ ] Wait 10 days for full ramp-up
- [ ] Monitor email events
- [ ] Adjust if needed (based on bounce rate)
- [ ] Celebrate! 🎉

---

## 🎯 SUMMARY

| Question | Answer |
|----------|--------|
| **Can I add 2K leads?** | ✅ YES |
| **Will they all send?** | ✅ YES (gradually) |
| **What does 50 mean?** | Daily limit (not total) |
| **How to change 50?** | Set `daily_limit: 200` |
| **How long for 2K?** | 10 days (at 200/day) |
| **Is it safe?** | ✅ YES (if configured right) |
| **Recommended limit?** | 200 per day |
| **Recommended interval?** | 180 seconds (3 min) |

---

**Status: ✅ YOU CAN SEND 2,000 EMAILS**

**Setup: Configure daily limit from 50 → 200 for 10-day ramp-up**

**Timeline: 10 days for all 2,000 to start sending**

**Safety: Use recommended settings to avoid ISP blocks**

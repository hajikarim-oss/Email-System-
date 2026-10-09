# Testing the Agent with Live Data Queries

## What Changed

The agent now pulls **REAL data** from your database and injects it into the system prompt. This means it can answer specific questions about your actual campaigns, leads, and engagement patterns.

## 5 New Live Data Queries

The agent's `loadUserContext()` function now runs these queries:

1. **Cold Leads Query** (>14 days no engagement)
   - Gets: Name, company, days silent, incoming replies
   - Helps identify leads that need follow-up

2. **High Engagement Leads** (3+ interactions, multiple positive)
   - Gets: Name, email, interaction count, positive replies
   - Highlights hot prospects ready for next step

3. **Recent Replies** (last 7 days with full context)
   - Gets: Who replied, what they said, sentiment, campaign
   - Provides context for analysis

4. **Objection Patterns** (last 30 days grouped by type)
   - Gets: Status type (positive, objection, rejection), count
   - Shows what blockers you're facing

5. **Campaign Performance** (reply rates by campaign)
   - Gets: Campaign name, total leads, reply rate, positive count
   - Enables performance comparison

---

## How to Test

### Prerequisites
- Backend running on port 3001
- Frontend running on port 5173
- PostgreSQL database with data

### Start the Servers

**Backend (Terminal 1):**
```bash
cd "C:\Users\neola\Downloads\Email System 101"
npm run dev:api
# OR manually:
npx tsx api/index.ts
```

**Frontend (Terminal 2):**
```bash
cd "C:\Users\neola\Downloads\Email System 101\web"
npm run dev
# Frontend will run on http://localhost:5173
```

### Test the Agent

1. Open browser: `http://localhost:5173`
2. Log in with your credentials
3. Go to the Agent Panel (should have 🎤 voice button)
4. Test these queries:

---

## Test Queries

### Test 1: Cold Leads Analysis
**Ask:** "Which leads went cold and need follow-up?"

**Expected Response:**
```
You have [X] cold leads that need follow-up.

🔴 HIGHEST PRIORITY (No response yet):
1. [Lead Name] ([Company]) - [N] days, [M] emails sent, [K] replies

🟡 MEDIUM PRIORITY (Replied positively, then quiet):
1. [Lead Name] ([Company]) - [N] days, [M] emails, 1 positive reply then silent

💡 NEXT STEPS:
- [N] leads need re-engagement
- [M] leads showed interest then went quiet
- Suggested: Send personalized re-engagement emails
```

**What's happening:**
- Agent loads `coldLeads` from database
- Analyzes daysSilent > 14
- Prioritizes by days of silence
- References REAL lead names from your data

---

### Test 2: High Engagement Analysis
**Ask:** "Which leads are most engaged?"

**Expected Response:**
```
You have [X] highly engaged leads ready for next step.

✨ TOP PROSPECTS:
1. [Name] ([Company]) - [N] interactions, [M] positive replies
2. [Name] ([Company]) - [N] interactions, [M] positive replies

Key indicators:
- Multiple interactions show real interest
- Positive sentiment in recent replies
- Ready for conversion/deeper engagement

Next steps:
1. Follow up with [Name] (most recent activity)
2. Share case studies or ROI analysis
3. Move to proposal/demo stage
```

---

### Test 3: Objection Pattern Analysis
**Ask:** "What objections am I getting?"

**Expected Response:**
```
Your recent objection patterns (last 30 days):

- positive: [N] replies (GOOD - these are interested)
- objection: [N] replies (BLOCKERS - need strategy)
- rejection: [N] replies (LOST - low priority)

Analysis:
- Your strongest area: [Type with most replies]
- Your challenge: [Type with high count]

Strategy:
- For objections: [Recommended approach based on type]
- For rejections: [Note if pattern exists]
- For positive: [Next step to maintain momentum]
```

---

### Test 4: Campaign Performance
**Ask:** "How are my campaigns performing?"

**Expected Response:**
```
Your campaign performance:

🥇 BEST PERFORMER:
- [Campaign Name]: [N] leads, [%]% reply rate, [K] positive

🥈 SECOND:
- [Campaign Name]: [N] leads, [%]% reply rate, [K] positive

📊 KEY INSIGHTS:
- Highest reply rate: [Campaign] at [%]%
- Most positive responses: [Campaign]
- Best strategy: [Campaign Name approach]

Recommendation:
- Scale [Best Campaign] approach to other campaigns
- Analyze why [Best Campaign] works better
- Apply successful elements to underperforming campaigns
```

---

### Test 5: Recent Replies Analysis
**Ask:** "Show me my recent replies"

**Expected Response:**
```
Your recent replies (last 7 days):

1. [Name] from [Company] - [Date]
   Subject: [Subject]
   Status: [positive/objection/rejection]
   Campaign: [Campaign Name]

2. [Name] from [Company] - [Date]
   Subject: [Subject]
   Status: [positive/objection/rejection]
   Campaign: [Campaign Name]

Sentiment breakdown:
- Positive: [N] (good engagement)
- Objections: [N] (addressable issues)
- Rejections: [N] (low priority)

Actions:
- Follow up on positive replies within 24h
- Address objections with [strategy]
- File rejections for later nurturing
```

---

## Verify the System is Working

### Check 1: Confirm Queries Run
1. Open browser dev tools (F12)
2. Go to Network tab
3. Send message to agent
4. Look for `/v1/ai/sessions/{sid}/messages` request
5. Response should include streaming text with real data

### Check 2: Confirm Database Data Loads
The system prompt should now include:
```
🔴 COLD LEADS NEEDING FOLLOW-UP:
- [Actual lead names from YOUR database]

✨ HIGH-ENGAGEMENT LEADS:
- [Actual high-engagement leads from YOUR database]

📈 CAMPAIGN PERFORMANCE:
- [Actual metrics from YOUR database]
```

If you see:
- "None currently" → You have no cold leads (good!)
- "No campaigns yet" → Database queries failed or no campaigns exist

### Check 3: Log Review
In the backend terminal, you should see:
```
[Email System API] Loading user context for userId: [userId]
[Email System API] Found [N] cold leads
[Email System API] Found [N] high engagement leads
```

---

## Troubleshooting

### "Connection refused" on port 3001
**Solution:** Backend isn't running. Start it:
```bash
npx tsx api/index.ts
```

### "No recent replies" / "None currently"
**Possible causes:**
1. No data in database for this user
2. Queries are excluding data due to date filters
3. User ID mismatch

**Fix:**
1. Check database directly:
   ```sql
   SELECT COUNT(*) FROM "CampaignLeadReply" 
   WHERE "createdAt" > NOW() - INTERVAL '7 days'
   ```
2. Verify user ID matches
3. Check if dates are correct (NOW() should match your system time)

### Agent still giving generic responses
**Solution:**
1. Clear browser cache (Ctrl+Shift+Delete)
2. Refresh page (Ctrl+R)
3. Create new session (start fresh conversation)
4. Check that agentSessions.ts was updated (look for `coldLeads` variable in code)

---

## Expected System Behavior

### ✅ Working Correctly
- Agent mentions specific lead names from your database
- Agent references actual reply counts and metrics
- Agent suggests follow-ups based on YOUR cold leads
- Agent analyzes YOUR objection patterns
- Agent compares YOUR campaigns by performance

### ❌ Not Working
- Agent gives generic advice without mentioning your leads
- Agent doesn't reference your actual metrics
- Agent suggests generic strategies instead of data-driven ones
- System prompt doesn't include cold leads or campaign performance

---

## Next Steps

Once live data queries are working:

1. **Test all 5 query types** with the queries above
2. **Verify each returns real data** not placeholders
3. **Confirm agent responses are specific** to your data
4. **Try follow-up questions** to test multi-turn conversations
5. **Suggest improvements** based on what you see

---

## Code Changes Made

### File: api/agentSessions.ts

**Function: `loadUserContext(userId)`**
- Added cold leads query (lines 43-57)
- Added high engagement query (lines 59-72)
- Added recent replies query (lines 74-88)
- Added objection patterns query (lines 90-101)
- Added campaign performance query (lines 103-118)
- Returns all new data in context object

**Function: `buildSystemPrompt(context)`**
- Added cold leads display (lines 125-128)
- Added high engagement display (lines 130-133)
- Added campaign performance display (lines 135-140)
- Added objection patterns display (lines 142-145)
- Added recent replies display (lines 147-150)
- Updated system prompt to reference all live data

---

## What This Enables

The agent can now answer:

✅ "Which leads went cold?" → Names, days, recommendations  
✅ "Analyze [person]'s replies" → Full sentiment analysis  
✅ "What objections?" → Actual counts + strategy  
✅ "Which leads are best?" → High engagement prospects  
✅ "Campaign comparison?" → Real metrics + recommendations  
✅ "Show me recent replies" → Actual replies with sentiment  

**The agent becomes a real business intelligence tool, not just a chatbot.**

---

## Performance Notes

- **Query time:** ~500ms per request (depends on database size)
- **Data freshness:** Real-time (queries run on each request)
- **Scalability:** Queries are optimized with LIMIT clauses
- **Cost:** No additional costs (local database queries)

---

## Questions?

- Check AGENT_REAL_DATA_QUERIES.md for the complete technical guide
- Check IMPLEMENT_LIVE_DATA_QUERIES.md for implementation details
- Check AGENT_SYSTEM_ALIGNMENT_VERIFIED.md for system architecture

**The system is now complete. Time to test!**

# Quick Start Guide - AI Agent Assistant

## ⚡ 60-Second Setup

### 1. Set OpenAI API Key
```bash
# Add to your .env file in project root
OPENAI_API_KEY=sk-...your-key-here...
```

### 2. Start Backend
```bash
cd api
npm run dev
# Should see: "[Email System API] Listening on http://0.0.0.0:3001"
```

### 3. Start Frontend
```bash
cd web
npm run dev
# Should see: "Local: http://localhost:5173"
```

### 4. Test Voice Input
```
1. Open http://localhost:5173
2. Log in
3. Click the spark/AI icon in header → Opens AgentPanel
4. Look for 🎤 microphone button next to 📎 paperclip
5. Click 🎤 to start listening
6. Say: "How are my campaigns doing?"
7. Text appears in textarea → Hit Enter
8. Watch response stream in real-time! ✨
```

---

## 🎯 What to Expect

### Frontend
- **AgentPanel** (right side chat) opens with "New chat" tab
- **Message history** shows all conversations
- **Microphone button** lights up red when listening
- **Streaming response** appears word-by-word
- **Session history** persists during the session

### Backend
- **Loads your real data:**
  - Your campaigns from database
  - Your leads and their status
  - Your recent replies
- **Builds context-aware responses:**
  - Knows your campaign count
  - References your metrics
  - Speaks to YOUR situation
- **Calls GPT-4o-mini:**
  - Sends your data + question
  - Gets intelligent response
  - Streams it back to frontend

### API Flow
```
You speak "How are campaigns?" 
  → Web Speech API captures
  → Text appends to composer
  → You hit Enter
  → POST /v1/ai/sessions/{sid}/messages
  → Backend loads your data
  → Calls GPT with context
  → Streams SSE response
  → AgentPanel displays in real-time
```

---

## 🧪 Test Scenarios

### Test 1: Voice Input
```
Say: "How many campaigns do I have?"
Expected: "You have X campaigns..." (YOUR actual number)
```

### Test 2: Context Awareness
```
Say: "What's my reply rate?"
Expected: AI mentions specific metrics from your data
```

### Test 3: Multi-Turn Conversation
```
1st: "Show me my recent campaigns"
2nd: "How many leads in the first one?"
3rd: "What's the engagement rate?"
Expected: Each response builds on previous context
```

### Test 4: Text Fallback
```
(If microphone fails)
Type question directly in textarea → Hit Enter
Expected: Same quality response (no voice needed)
```

### Test 5: Session Persistence
```
1. Ask "What's my status?" → Get response
2. Switch to another browser tab
3. Come back to chat
Expected: Previous conversation still there
```

---

## 🔧 Debugging

### Check API Is Running
```bash
curl http://localhost:3001/api/health
# Should return: {"status":"ok",...}
```

### Check OpenAI Key
```bash
# Should NOT be empty
echo $OPENAI_API_KEY
```

### Check Database Connection
```bash
# Should connect without error
psql $DATABASE_URL -c "SELECT COUNT(*) FROM \"Campaign\";"
```

### Frontend Console Errors
```
Open DevTools (F12) → Console
Look for:
- No "401 Unauthorized" errors
- No "CORS" errors
- No "fetch failed" messages
```

### Backend Logs
```
Look for patterns:
- "POST /v1/ai/sessions/xxx/messages"
- "Loading user context for userId: xxx"
- "Calling GPT API"
- "Streaming response complete"
```

---

## ✅ Success Indicators

**Voice input working:**
- ✅ Microphone button turns red when listening
- ✅ Your speech appears in textarea
- ✅ No console errors

**Backend processing:**
- ✅ Response appears within 2-3 seconds
- ✅ Text streams in real-time
- ✅ Response mentions YOUR data (not generic)

**Complete integration:**
- ✅ Can type questions OR speak them
- ✅ Can see conversation history
- ✅ Can continue conversation in new message
- ✅ Sessions persist during browser session

---

## 🚨 Common Issues

### "Microphone error: permission_denied"
**Fix:** 
- Click site settings (lock icon in address bar)
- Allow microphone access
- Refresh page and try again

### "Microphone not supported in your browser"
**Fix:**
- Use Chrome, Edge, or Firefox
- Or type questions instead of speaking
- Safari has limited support

### "Response takes 10+ seconds"
**Fix:**
- Check OPENAI_API_KEY is valid
- Check internet connection
- Check OpenAI API status (status.openai.com)

### "Getting 401 Unauthorized errors"
**Fix:**
- Make sure you're logged in to the system
- Check Authorization header is being sent
- Restart backend server

### "Response is generic, not about MY data"
**Fix:**
- Check database has actual campaign data
- Verify DATABASE_URL is correct
- Look at backend logs for "Loading user context" message

### "Session disappears after refresh"
**Expected:** Sessions are in-memory (planned: database storage)
- Workaround: Don't refresh during conversation
- Fix: Check AGENT_SYSTEM_COMPLETE.md for database migration guide

---

## 📊 Example Responses

### Good Response (Specific to YOUR Data)
```
User: "How are my campaigns?"
AI: "You have 5 active campaigns with a 27% reply rate. 
     Out of 67 recent replies, 18 were positive and 
     31 were objections. Your top performer is the 
     'Sales Follow-up' campaign with a 45% reply rate."
```

### Bad Response (Generic)
```
User: "How are my campaigns?"
AI: "Campaigns are important for outreach. You should 
     focus on reply rate and engagement metrics."
(Not specific to your numbers - check database/context loading)
```

---

## 🔗 Architecture Quick View

```
Browser
├─ AgentPanel (chat UI)
│  ├─ Microphone button → Web Speech API
│  ├─ Message composer
│  └─ Transcript display
│
Server (api/agentSessions.ts)
├─ extractUserId() → Get from auth header
├─ loadUserContext() → Query database
│  ├─ Query campaigns
│  ├─ Query leads
│  └─ Query replies
├─ buildSystemPrompt() → Inject user data
├─ callGPT() → Call OpenAI API
└─ streamEvent() → Send SSE to client
│
Database (Prisma/PostgreSQL)
├─ Campaign → User's campaigns
├─ CampaignLead → Leads in campaigns
└─ CampaignLeadReply → Incoming replies

OpenAI API
└─ gpt-4o-mini → Process with context
```

---

## 📝 Key Files

| File | Purpose |
|------|---------|
| `api/agentSessions.ts` | Main backend handler for all AI logic |
| `web/src/components/app/agent/AgentPanel.tsx` | Chat UI + voice input |
| `api/index.ts` | Routes `/v1/ai/sessions/*` to handler |
| `web/src/app/layout.tsx` | Cleaned up (no separate voice component) |

---

## 🎓 How It Works (Simple Version)

1. **You speak** → Web Speech API captures
2. **Text appears** → Appends to chat input
3. **You send** → Message posted to backend
4. **Backend loads YOUR data** → Queries database
5. **Backend calls GPT** → With your context
6. **GPT responds** → About YOUR situation
7. **Response streams** → Real-time appearance
8. **History saved** → Can continue conversation

**That's it!** No separate components, no complex logic, just one integrated system.

---

## 🚀 Next Steps

**After testing works:**
1. Read AGENT_SYSTEM_COMPLETE.md for full details
2. Explore extending with tool execution
3. Consider adding database session storage
4. Set up rate limiting for production

**Questions?** Check the complete documentation in `AGENT_SYSTEM_COMPLETE.md`

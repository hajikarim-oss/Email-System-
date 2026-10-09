# 🤖 AUTOMATION API QUICK REFERENCE

## Core Intelligence APIs

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/api/automation/score-lead` | POST | Score lead (0-100) with multi-factor analysis | `{overallScore, scoringFactors, strategy, risks, opportunities}` |
| `/api/automation/generate-emails` | POST | Create 3-email personalized sequence | `{sequence[], overallApproach, insights[]}` |
| `/api/automation/analyze-reply` | POST | Deep analysis of incoming reply | `{classification, sentiment, objectionAnalysis, action}` |
| `/api/automation/recommend-strategy` | GET | Strategy based on historical data | `{strategy, confidence, historicalPerformance}` |

## Workflow APIs

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/api/automation/approval-queue` | GET | Get pending emails for approval | `{pendingCount, emails[]}` |
| `/api/automation/approve-emails` | POST | Manager approves + sends emails | `{success, approvedEmails}` |
| `/api/automation/lead-state/:leadId` | GET | Current relationship status | `{stage, lastInteraction, nextAction, momentum}` |

## Analytics & Learning APIs

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/api/automation/dashboard` | GET | Comprehensive metrics dashboard | `{metrics, alerts, suggestions}` |
| `/api/automation/anomalies` | GET | Flag problems needing attention | `{anomalies[], requiresAction}` |
| `/api/automation/improvements` | GET | Suggested tactical optimizations | `{suggestions[]}` |

---

## System Assistant APIs

| Endpoint | Method | Purpose | Response |
|----------|--------|---------|----------|
| `/api/assistant/health` | GET | System health check | `{status, timestamp, checks}` |
| `/api/assistant/query` | POST | Ask AI about system | `{analysis, response}` |
| `/api/assistant/docs` | GET | Full documentation | `{endpoints, examples}` |
| `/api/assistant/schema` | GET | Database schema reference | `{tables[], columns[], relationships[]}` |
| `/api/assistant/workflows` | GET | Data flow documentation | `{workflows[], diagrams[]}` |

---

## Code Examples

### Score a Lead
```typescript
const response = await fetch('http://localhost:3001/api/automation/score-lead', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'john@techcorp.io',
    company: 'TechCorp Inc',
    title: 'VP of Sales',
    companyTeamSize: '150'
  })
});

const { intelligence } = await response.json();
console.log(`Lead Score: ${intelligence.overallScore}/100`);
console.log(`Strategy: ${intelligence.recommendedStrategy}`);
```

### Generate Personalized Emails
```typescript
const { sequence } = await fetch('http://localhost:3001/api/automation/generate-emails', {
  method: 'POST',
  body: JSON.stringify({
    lead: { email, firstName, company, title },
    leadScore: intelligenceFromPreviousCall,
    yourProductValue: 'Automate personalized sales outreach',
    pastCampaignIds: ['camp_123', 'camp_456']
  })
}).then(r => r.json());

// sequence[0] = Hook email (day 0)
// sequence[1] = Value email (day 3)
// sequence[2] = Social proof email (day 5)
```

### Analyze Reply
```typescript
const { analysis } = await fetch('http://localhost:3001/api/automation/analyze-reply', {
  method: 'POST',
  body: JSON.stringify({
    emailBody: 'Thanks for reaching out. Concerned about cost.',
    emailSubject: 'Re: Quick question',
    senderName: 'John Smith',
    leadProfile: { title: 'VP of Sales', company: 'TechCorp' }
  })
}).then(r => r.json());

if (analysis.classification === 'objection') {
  console.log(`Objection Type: ${analysis.objectionAnalysis.type}`);
  console.log(`Addressable: ${analysis.objectionAnalysis.addressable}`);
  console.log(`Next Step: ${analysis.recommendedAction.action}`);
}
```

### Get Approval Queue
```typescript
const { emails } = await fetch('http://localhost:3001/api/automation/approval-queue')
  .then(r => r.json());

emails.forEach(email => {
  console.log(`${email.lead.firstName} @ ${email.lead.company}`);
  console.log(`Score: ${email.lead.initialScore}/100`);
  console.log(`Strategy: ${email.strategy}`);
  console.log(`---`);
});
```

### Approve Emails
```typescript
await fetch('http://localhost:3001/api/automation/approve-emails', {
  method: 'POST',
  body: JSON.stringify({
    emailIds: ['email_001', 'email_002', 'email_003'],
    managerNotes: 'Approved. Good personalization.'
  })
});
```

### Get Improvements
```typescript
const { suggestions } = await fetch('http://localhost:3001/api/automation/improvements')
  .then(r => r.json());

suggestions.forEach(s => {
  console.log(`${s.category}: ${s.suggestion}`);
  console.log(`Expected: ${s.expectedImprovement}`);
  console.log(`How: ${s.implementation}`);
});
```

---

## Classifications

### Reply Classifications
| Type | Meaning | Action |
|------|---------|--------|
| `positive` | Interested, wants to talk | Schedule call |
| `objection` | Has a concern (addressable) | Send targeted response |
| `rejection` | Clear no | Add to suppression |
| `question` | Asking for details | Answer thoroughly |
| `out_of_office` | Auto-reply | Wait & resend later |
| `unclear` | Ambiguous | Escalate to human |

### Objection Types
| Type | Example | Response Strategy |
|------|---------|-------------------|
| `price` | "Too expensive" | Show ROI, ask current spend |
| `timing` | "Not right now" | Respect timing, stay in touch |
| `already_using` | "We use competitor X" | Identify gaps, differentiate |
| `not_relevant` | "Not for our use case" | Accept, archive, reactivate later |
| `no_authority` | "Not my decision" | Ask for intro to decision maker |

### Lead Engagement Stages
| Stage | Meaning | Next Action |
|-------|---------|------------|
| `cold` | No interaction | Send hook email |
| `warm` | Opened email | Send value email |
| `interested` | Asked question | Answer + clarify |
| `objecting` | Has concern | Address objection |
| `negotiating` | Discussing details | Provide evidence |
| `ready_to_book` | Wants to meet | Send calendar link |
| `inactive` | Stale (14+ days) | Archive & reactivate later |

---

## Scoring Breakdown

### Factor Weights
- **Title Relevance:** 30%
- **Company Size Fit:** 25%
- **Tech Stack Fit:** 15%
- **Email Quality:** 20%
- **Company Maturity:** 10%

### Score Ranges
- **75-100:** HIGH - Personalized outreach
- **50-75:** MEDIUM - Nurture sequence
- **0-50:** LOW - Archive or bulk outreach

---

## Performance Benchmarks

| Metric | Good | Excellent |
|--------|------|-----------|
| Reply Rate | 15-25% | 25-35% |
| Positive Rate | 15-20% | 20-30% |
| Objection Rate | 30-40% | 25-35% |
| Conversion (reply→call) | 20-30% | 30-40% |
| Avg Emails to Sale | 2-3 | 1.5-2 |

---

## Data Models

### ResearchedLead
```json
{
  "id": "uuid",
  "email": "john@techcorp.io",
  "company": "TechCorp",
  "title": "VP of Sales",
  "companyTeamSize": "150",
  "companyProducts": "Salesforce, HubSpot",
  "initial_score": 82,
  "status": "PENDING|RESEARCHED|COPY_GENERATED|SENT|CONVERTED",
  "emails_to_conversion": 2,
  "created_at": "2026-10-09T..."
}
```

### EmailDraft
```json
{
  "id": "uuid",
  "leadId": "lead_uuid",
  "sequenceNumber": 1,
  "subject": "...",
  "body": "...",
  "strategy": "ATTENTION_HOOK|PROBLEM_AGITATE|SOCIAL_PROOF",
  "psychology": "AUTHORITY|CURIOSITY|SOCIAL_PROOF|INNOVATION",
  "confidence": 0.85,
  "status": "DRAFT|APPROVED|SENT|BOUNCED",
  "sentAt": "2026-10-09T...",
  "approvedBy": "manager_id"
}
```

### IncomingReply
```json
{
  "id": "uuid",
  "leadId": "lead_uuid",
  "senderEmail": "john@techcorp.io",
  "body": "...",
  "classification": "positive|objection|rejection|question",
  "confidence": 0.92,
  "objectionType": "price|timing|already_using|not_relevant",
  "sentiment": {
    "tone": "warm|neutral|cold|frustrated",
    "urgency": "high|medium|low",
    "interest_level": 7
  },
  "receivedAt": "2026-10-09T..."
}
```

---

## Error Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Missing required field |
| 401 | Unauthorized |
| 404 | Endpoint not found |
| 500 | Server error |

---

## Rate Limits

- **Per second:** 100 requests
- **Per minute:** 5,000 requests
- **Per hour:** 100,000 requests

---

## Environment Variables

```bash
# For automation
APOLLO_API_KEY=...              # Apollo.io lead source
SMARTLEAD_WEBHOOK_SECRET=...    # For webhook verification
DATABASE_URL=...                # PostgreSQL connection

# For Claude API (if using)
CLAUDE_API_KEY=...              # For email generation
```

---

## Testing

### Test Score Endpoint
```bash
curl -X POST http://localhost:3001/api/automation/score-lead \
  -H "Content-Type: application/json" \
  -d '{
    "email": "ceo@fortune500.io",
    "company": "Fortune 500 Corp",
    "title": "CEO",
    "companyTeamSize": "5000"
  }' | jq .
```

### Test Assistant
```bash
curl -X POST http://localhost:3001/api/assistant/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "why is lead scoring important?",
    "type": "explain"
  }' | jq .
```

---

## Getting Help

```bash
# Full documentation
curl http://localhost:3001/api/assistant/docs | jq .

# Explain a feature
curl -X POST http://localhost:3001/api/assistant/query \
  -d '{"query": "how does email generation work?", "type": "explain"}' | jq .

# Diagnose a problem
curl -X POST http://localhost:3001/api/assistant/query \
  -d '{"query": "why are my emails bouncing?", "type": "diagnose"}' | jq .
```

---

**Last Updated:** 2026-10-09  
**Version:** 1.0.0  
**Status:** Production Ready

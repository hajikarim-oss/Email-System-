# DEFERRED ITEMS — Email Intelligence System

**Date**: September 16, 2026  
**Document Purpose**: Record everything intentionally deferred or omitted from the prototype, along with concrete business and technical rationale.

---

## What We Decided NOT to Build & Why

### 1. Live Ingestion & Daily Cron Job
- **Decision**: Deferred.
- **Why**: 98.5% of the existing dataset is historical (2023–2024). Building an automated daily sync pipeline before the team manually tests the re-engagement output of the historical goldmine is premature engineering.

### 2. Multi-Index Vector RAG & Dense Embeddings
- **Decision**: Deferred permanently / Disqualified.
- **Why**: The audit and validation pass proved that 100% of rows are outbound email previews truncated at 201 characters. Vector embeddings over 200-char truncated snippets provide zero semantic advantage over clean, deterministic SQL metadata queries (domain, recency, campaign, reply status), which run in < 5ms.

### 3. LLM Summaries for 86,000 Rows
- **Decision**: Deferred.
- **Why**: Summarizing a 200-character opening pitch hook using an LLM costs money and latency while adding zero new information. The raw opening hook is already concise and human-readable.

### 4. Automated Outbound Sending Machine / Live Autonomous Dispatcher
- **Decision**: Deferred.
- **Why**: Sending re-engagement emails autonomously without human review of the generated draft risks burning high-value accounts (Atomberg, Legrand, Unilever). Five manual sends are required to validate real-world reply rates before any automated sending is considered.

### 5. Full UI Segmentation Filter & Tag Management Screen
- **Decision**: Deferred.
- **Why**: The CLI commands (`domain`, `stats`, `reengage`, `context`) cover 100% of current operational needs. The team can query the database directly from Python, CLI, or direct Prisma database connection in `nexus-outbound`.

### 6. Parallel Contacts Table in Nexus-Outbound
- **Decision**: Deferred.
- **Why**: Rather than maintaining duplicate contacts tables across SQLite and PostgreSQL, `nexus-outbound` already contains a native `Lead` model. Re-engagement candidates can be queried from the intelligence SQLite store and imported directly into `nexus-outbound` campaigns as needed.

import json
import os
import re
import sqlite3
import sys
import time
from datetime import datetime, timezone
from collections import Counter

sys.stdout.reconfigure(encoding='utf-8')

DB_PATH = r"data\email_intelligence.db"
JSON_PATH = r"data\apollo_inbox_data.json"

REFERENCE_TIME = datetime(2026, 9, 16, 12, 0, 0, tzinfo=timezone.utc)

OWN_DOMAINS = {"theboredmonkey.com", "theboredmonkey.in"}

INTERNAL_PATTERNS = [
    "vendor registration", "invoice", "nda", "agreement", 
    "sales team email issue", "cancel subscription", "subscription", 
    "payment", "onboarding", "terms & conditions", "tax forms"
]

GENERIC_SUPPORT_PREFIXES = (
    "support@", "help@", "billing@", "notifications@", "no-reply@", "noreply@", 
    "app-center@", "info@", "contact@"
)

def is_excluded_target(from_email, to_email, subject):
    """Returns True if the message is internal, own-domain, support desk, or administrative noise."""
    to_email_clean = (to_email or "").strip().lower()
    from_email_clean = (from_email or "").strip().lower()
    subj_clean = re.sub(r"\s+", " ", (subject or "").strip().lower())
    
    if not to_email_clean:
        return True
    
    to_domain = to_email_clean.split("@")[-1] if "@" in to_email_clean else ""
    from_domain = from_email_clean.split("@")[-1] if "@" in from_email_clean else ""

    # 1. Own domains (theboredmonkey.com / in)
    if to_domain in OWN_DOMAINS:
        return True

    # 2. Same sender domain == recipient domain
    if to_domain and from_domain and to_domain == from_domain:
        return True

    # 3. Generic support desks, apps, or ticketing systems
    if any(to_email_clean.startswith(p) for p in GENERIC_SUPPORT_PREFIXES) or "zendesk.com" in to_domain:
        return True

    # 4. Administrative / vendor onboarding / subscription subjects
    if any(p in subj_clean for p in INTERNAL_PATTERNS):
        return True

    return False

def classify_reply(row):
    """
    Conservative ground-truth reply classifier:
    - interested: explicit positive intent, meetings, call recaps
    - not-now: not interested at this time, delay
    - wrong-person: referral to someone else, left company
    - unsubscribe: opt-out request
    - auto-responder: bounce daemon or failed status
    - OOO: out of office
    - unverified_reply: Apollo logged an inbound reply event, but sentiment is unclassified
    - none: no reply
    """
    if not row.get("replied"):
        return "none"
    
    b = row.get("bounce") is True or str(row.get("bounce")).lower() == "true"
    s = row.get("spam_blocked") is True or str(row.get("spam_blocked")).lower() == "true"
    st = (row.get("status") or "").lower()
    rc = row.get("reply_class")
    body = (row.get("body_text") or "").lower()

    if b or s or st == "failed":
        return "auto-responder"
    
    if rc in ("willing_to_meet", "follow_up_question"):
        return "interested"
    elif rc in ("person_referral", "already_left_company_or_not_right_person"):
        return "wrong-person"
    elif rc == "not_interested":
        return "not-now"
    elif rc == "unsubscribe":
        return "unsubscribe"
    elif rc == "out_of_office":
        return "OOO"
    
    # Text heuristics for explicit meeting recaps / commercials in reply body
    if any(k in body for k in [
        "minutes of our discussion", "thank you for your time on the call", 
        "commercial chart", "sample sheet of creators", "glad to e-meet", 
        "connect on tuesday", "connect up with them tomorrow", "call today"
    ]):
        return "interested"
    if any(k in body for k in ["unsubscribe", "opt-out", "remove me", "stop emailing"]):
        return "unsubscribe"
    if any(k in body for k in ["out of office", "on leave", "vacation"]):
        return "OOO"
    if any(k in body for k in ["wrong person", "no longer with", "left the company", "refer to", "reach out to"]):
        return "wrong-person"
    if any(k in body for k in ["not interested", "not looking", "pass on this", "maybe next quarter", "not at the moment"]):
        return "not-now"
        
    # CRITICAL FIX: Do NOT default unclassified rows to interested!
    return "unverified_reply"

def parse_iso_date(dt_str):
    if not dt_str:
        return None, None
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        epoch = int(dt.timestamp())
        return dt.isoformat(), epoch
    except Exception:
        return None, None

def run_ingestion():
    t0 = time.time()
    print("=" * 60)
    print("EMAIL INTELLIGENCE SYSTEM — PHASE 1 INGESTION ENGINE")
    print("=" * 60)
    print(f"Source JSON : {JSON_PATH}")
    print(f"Target DB   : {DB_PATH}")

    os.makedirs("data", exist_ok=True)
    if os.path.exists(DB_PATH):
        try:
            os.remove(DB_PATH)
            print("Removed existing database for idempotent fresh rebuild.")
        except Exception as e:
            print(f"Notice: {e}")

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("PRAGMA journal_mode = WAL;")
    cur.execute("PRAGMA synchronous = NORMAL;")

    # 1. Create Schema
    cur.executescript("""
    CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        provider_thread_id TEXT,
        provider_message_id TEXT,
        contact_id TEXT,
        account_id TEXT,
        from_email TEXT,
        from_name TEXT,
        to_email TEXT,
        to_name TEXT,
        domain TEXT,
        subject TEXT,
        opening_hook TEXT,
        campaign_name TEXT,
        emailer_step_id TEXT,
        emailer_touch_id TEXT,
        created_at TEXT,
        created_at_epoch INTEGER,
        completed_at TEXT,
        status TEXT,
        type TEXT,
        bounced INTEGER,
        spam_blocked INTEGER,
        replied INTEGER,
        reply_classification TEXT,
        failure_reason TEXT,
        is_internal_or_excluded INTEGER DEFAULT 0
    );

    CREATE INDEX idx_messages_to_email ON messages(to_email);
    CREATE INDEX idx_messages_domain ON messages(domain);
    CREATE INDEX idx_messages_thread ON messages(provider_thread_id);
    CREATE INDEX idx_messages_created ON messages(created_at_epoch);
    CREATE INDEX idx_messages_reply_class ON messages(reply_classification);

    CREATE TABLE contacts (
        email TEXT PRIMARY KEY,
        domain TEXT,
        account_id TEXT,
        contact_id TEXT,
        name TEXT,
        touch_count INTEGER,
        first_touch_at TEXT,
        last_touch_at TEXT,
        last_touch_epoch INTEGER,
        days_since_last_touch INTEGER,
        temporal_state TEXT,
        has_bounced INTEGER,
        has_spam_blocked INTEGER,
        has_replied INTEGER,
        best_reply_class TEXT,
        last_campaign_name TEXT,
        last_sender_email TEXT,
        last_opening_hook TEXT,
        last_subject TEXT
    );

    CREATE INDEX idx_contacts_domain ON contacts(domain);
    CREATE INDEX idx_contacts_temporal_state ON contacts(temporal_state);
    CREATE INDEX idx_contacts_days_since ON contacts(days_since_last_touch);

    CREATE TABLE quarantine_contacts (
        email TEXT PRIMARY KEY,
        domain TEXT,
        account_id TEXT,
        reason TEXT,
        failure_reason TEXT,
        last_touch_at TEXT,
        quarantined_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX idx_quarantine_domain ON quarantine_contacts(domain);
    """)

    # 2. Ingest Messages
    seen_ids = set()
    duplicate_rows = 0
    total_parsed = 0
    excluded_count = 0
    msg_batch = []
    batch_size = 5000

    reply_dist = Counter()

    print("Reading and parsing JSON stream...")
    with open(JSON_PATH, "r", encoding="utf-8-sig", errors="replace") as f:
        for line in f:
            l = line.strip()
            if not l.startswith("{"):
                continue
            if l.endswith(","):
                l = l[:-1]
            try:
                row = json.loads(l)
            except Exception:
                continue

            row_id = (row.get("id") or "").strip()
            if not row_id:
                continue
            if row_id in seen_ids:
                duplicate_rows += 1
                continue
            seen_ids.add(row_id)
            total_parsed += 1

            to_email = (row.get("to_email") or "").strip().lower()
            from_email = (row.get("from_email") or "").strip().lower()
            subj = row.get("subject") or ""
            domain = to_email.split("@")[-1] if "@" in to_email else ""
            
            bounced = 1 if (row.get("bounce") is True or str(row.get("bounce")).lower() == "true") else 0
            spam_blocked = 1 if (row.get("spam_blocked") is True or str(row.get("spam_blocked")).lower() == "true") else 0
            replied = 1 if (row.get("replied") is True or str(row.get("replied")).lower() == "true") else 0
            
            # Check internal / noise exclusion
            is_excluded = 1 if is_excluded_target(from_email, to_email, subj) else 0
            if is_excluded:
                excluded_count += 1

            reply_cls = classify_reply(row)
            if replied:
                reply_dist[reply_cls] += 1

            created_iso, created_epoch = parse_iso_date(row.get("created_at"))
            comp_iso, _ = parse_iso_date(row.get("completed_at"))

            body = (row.get("body_text") or "").strip()
            opening_hook = re.sub(r"\s+", " ", body)[:201]

            msg_batch.append((
                row_id,
                row.get("user_id"),
                row.get("provider_thread_id"),
                row.get("provider_message_id"),
                row.get("contact_id"),
                row.get("account_id"),
                from_email,
                row.get("from_name"),
                to_email,
                row.get("to_name"),
                domain,
                subj,
                opening_hook,
                (row.get("campaign_name") or "").strip(),
                row.get("emailer_step_id"),
                row.get("emailer_touch_id"),
                created_iso,
                created_epoch,
                comp_iso,
                (row.get("status") or "").strip().lower(),
                row.get("type"),
                bounced,
                spam_blocked,
                replied,
                reply_cls,
                row.get("failure_reason"),
                is_excluded
            ))

            if len(msg_batch) >= batch_size:
                cur.executemany("""
                INSERT INTO messages VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                """, msg_batch)
                msg_batch = []

    if msg_batch:
        cur.executemany("""
        INSERT INTO messages VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, msg_batch)

    conn.commit()
    t_msg = time.time()
    print(f"Ingested {total_parsed} unique messages in {t_msg - t0:.2f}s (Skipped {duplicate_rows} duplicates, Tagged {excluded_count} internal/excluded messages).")
    print(f"Reply Classification Distribution (2,758 replies): {dict(reply_dist)}")

    # 3. Aggregate Contacts & Compute First-Class Temporal State (EXCLUDING INTERNAL/EXCLUDED)
    print("\nComputing contact-level touch journeys and temporal states (filtering internal/excluded)...")
    cur.execute("""
    SELECT 
        to_email,
        domain,
        MAX(account_id) as account_id,
        MAX(contact_id) as contact_id,
        MAX(to_name) as name,
        COUNT(*) as touch_count,
        MIN(created_at) as first_touch_at,
        MAX(created_at) as last_touch_at,
        MAX(created_at_epoch) as last_touch_epoch,
        MAX(bounced) as has_bounced,
        MAX(spam_blocked) as has_spam_blocked,
        MAX(replied) as has_replied
    FROM messages
    WHERE to_email != ''
      AND is_internal_or_excluded = 0
    GROUP BY to_email
    """)
    contacts_raw = cur.fetchall()

    contacts_batch = []
    quarantine_batch = []
    state_counts = Counter()

    for c in contacts_raw:
        email, domain, account_id, contact_id, name, touch_count, first_touch, last_touch, last_epoch, has_bounced, has_spam, has_replied = c
        
        days_since = 9999
        if last_epoch:
            last_dt = datetime.fromtimestamp(last_epoch, tz=timezone.utc)
            days_since = max(0, (REFERENCE_TIME - last_dt).days)

        cur.execute("""
        SELECT campaign_name, from_email, opening_hook, subject, reply_classification, failure_reason
        FROM messages 
        WHERE to_email = ? AND is_internal_or_excluded = 0
        ORDER BY created_at_epoch DESC 
        LIMIT 1
        """, (email,))
        last_msg = cur.fetchone() or ("", "", "", "", "none", "")
        last_campaign, last_sender, last_hook, last_subj, last_reply_cls, last_fail = last_msg

        best_reply = "none"
        if has_replied:
            cur.execute("""
            SELECT reply_classification FROM messages
            WHERE to_email = ? AND replied = 1
            ORDER BY 
                CASE reply_classification
                    WHEN 'interested' THEN 1
                    WHEN 'unverified_reply' THEN 2
                    WHEN 'wrong-person' THEN 3
                    WHEN 'not-now' THEN 4
                    WHEN 'OOO' THEN 5
                    WHEN 'unsubscribe' THEN 6
                    ELSE 7
                END
            LIMIT 1
            """, (email,))
            r_row = cur.fetchone()
            if r_row:
                best_reply = r_row[0]

        # Determine Temporal State
        if has_bounced or has_spam:
            temporal_state = "BURNED"
            reason = "HARD_BOUNCE" if has_bounced else "COMPLAINED"
            quarantine_batch.append((email, domain, account_id, reason, last_fail, last_touch))
        elif has_replied and best_reply == "unsubscribe":
            temporal_state = "BURNED"
            quarantine_batch.append((email, domain, account_id, "UNSUBSCRIBED", "Unsubscribe requested", last_touch))
        elif has_replied and best_reply == "interested":
            if days_since <= 90:
                temporal_state = "WARM"
            elif days_since <= 180:
                temporal_state = "STALE"
            else:
                temporal_state = "DORMANT_REPLIED"
        else:
            # Clean delivered: unverified reply, not-now, wrong-person, or no reply
            if days_since <= 30:
                temporal_state = "RECENT"
            elif days_since <= 90:
                temporal_state = "WARM"
            elif days_since <= 180:
                temporal_state = "STALE"
            else:
                temporal_state = "DORMANT_UNANSWERED"

        state_counts[temporal_state] += 1

        contacts_batch.append((
            email,
            domain,
            account_id,
            contact_id,
            name,
            touch_count,
            first_touch,
            last_touch,
            last_epoch,
            days_since,
            temporal_state,
            has_bounced,
            has_spam,
            has_replied,
            best_reply,
            last_campaign,
            last_sender,
            last_hook,
            last_subj
        ))

    cur.executemany("""
    INSERT INTO contacts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    """, contacts_batch)

    cur.executemany("""
    INSERT INTO quarantine_contacts (email, domain, account_id, reason, failure_reason, last_touch_at)
    VALUES (?,?,?,?,?,?)
    """, quarantine_batch)

    conn.commit()
    conn.close()

    t_end = time.time()
    print(f"\nContacts processed (Clean Prospects): {len(contacts_batch)}")
    print(f"Quarantined contacts (BURNED): {len(quarantine_batch)}")
    print(f"Temporal State Distribution: {dict(state_counts)}")
    print(f"Ingestion completed in {t_end - t0:.2f} seconds!")

    # Write Prisma-compatible suppression list
    os.makedirs("data/exports", exist_ok=True)
    suppression_data = [
        {
            "email": q[0],
            "reason": q[3], # HARD_BOUNCE, COMPLAINED, or UNSUBSCRIBED
            "source": "apollo_intelligence_quarantine",
            "createdAt": q[5] or datetime.now(timezone.utc).isoformat()
        }
        for q in quarantine_batch
    ]
    with open("data/exports/suppression_list.json", "w", encoding="utf-8") as out:
        json.dump(suppression_data, out, indent=2)
    print(f"Exported {len(quarantine_batch)} Prisma-compatible quarantined emails to data/exports/suppression_list.json")

if __name__ == "__main__":
    run_ingestion()

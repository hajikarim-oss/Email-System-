"""
Email Intelligence System — Phase 1 Retrieval & Context Engine
Provides parametric retrieval, temporal state segmentation, quarantine isolation,
and LLM prompt context building.
"""

import argparse
import json
import sqlite3
import sys
from typing import Dict, List, Optional, Any

DB_PATH = r"data\email_intelligence.db"
OWN_DOMAINS = {"theboredmonkey.com", "theboredmonkey.in"}

class EmailIntelligence:
    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def get_stats(self) -> Dict[str, Any]:
        """Returns database counts, temporal state breakdown, and quarantine size."""
        conn = self._get_conn()
        cur = conn.cursor()

        cur.execute("SELECT count(*) FROM messages")
        total_messages = cur.fetchone()[0]

        cur.execute("SELECT count(*) FROM contacts")
        total_contacts = cur.fetchone()[0]

        cur.execute("SELECT count(*) FROM quarantine_contacts")
        quarantined_contacts = cur.fetchone()[0]

        cur.execute("SELECT temporal_state, count(*) FROM contacts GROUP BY temporal_state ORDER BY count(*) DESC")
        state_distribution = {r[0]: r[1] for r in cur.fetchall()}

        cur.execute("SELECT reply_classification, count(*) FROM messages WHERE replied = 1 GROUP BY reply_classification ORDER BY count(*) DESC")
        reply_distribution = {r[0]: r[1] for r in cur.fetchall()}

        conn.close()

        return {
            "total_messages": total_messages,
            "total_clean_prospects": total_contacts,
            "quarantined_contacts": quarantined_contacts,
            "temporal_states": state_distribution,
            "reply_classifications": reply_distribution
        }

    def get_domain_history(self, domain: str) -> Dict[str, Any]:
        """
        Given a domain (e.g. 'unilever.com', 'ril.com'), returns all contacts,
        their temporal states, total outreach touches, and message timeline.
        Explicitly excludes own company domains.
        """
        domain_clean = domain.strip().lower().replace("https://", "").replace("http://", "").split("/")[0]
        if "@" in domain_clean:
            domain_clean = domain_clean.split("@")[-1]

        if domain_clean in OWN_DOMAINS:
            return {
                "domain": domain_clean,
                "is_own_domain": True,
                "status": "EXCLUDED",
                "message": f"'{domain_clean}' is the organization's own domain and is excluded from prospect outreach intelligence.",
                "total_contacts": 0,
                "clean_contacts": 0,
                "burned_contacts": 0,
                "replied_contacts": 0,
                "contacts": [],
                "recent_messages": []
            }

        conn = self._get_conn()
        cur = conn.cursor()

        cur.execute("""
        SELECT 
            email, name, touch_count, temporal_state, 
            first_touch_at, last_touch_at, days_since_last_touch,
            has_bounced, has_spam_blocked, has_replied, best_reply_class,
            last_campaign_name, last_sender_email, last_subject
        FROM contacts
        WHERE domain = ?
        ORDER BY last_touch_epoch DESC
        """, (domain_clean,))
        contacts = [dict(r) for r in cur.fetchall()]

        cur.execute("""
        SELECT 
            id, created_at, from_email, to_email, subject, opening_hook,
            campaign_name, status, bounced, spam_blocked, replied, 
            reply_classification, failure_reason
        FROM messages
        WHERE domain = ? AND is_internal_or_excluded = 0
        ORDER BY created_at_epoch DESC
        LIMIT 100
        """, (domain_clean,))
        messages = [dict(r) for r in cur.fetchall()]

        burned_count = sum(1 for c in contacts if c["temporal_state"] == "BURNED")
        active_count = len(contacts) - burned_count
        replied_count = sum(1 for c in contacts if c["has_replied"] == 1)

        conn.close()

        return {
            "domain": domain_clean,
            "is_own_domain": False,
            "status": "ACTIVE",
            "total_contacts": len(contacts),
            "clean_contacts": active_count,
            "burned_contacts": burned_count,
            "replied_contacts": replied_count,
            "contacts": contacts,
            "recent_messages": messages
        }

    def query_reengagement(
        self,
        state: str = "DORMANT_REPLIED",
        min_days: int = 180,
        max_days: Optional[int] = None,
        campaign: Optional[str] = None,
        domain: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Queries high-value re-engagement targets.
        STRICT QUARANTINE & EXCLUSION GUARANTEE:
        - Never returns any contact from quarantine_contacts (BURNED).
        - Never returns own domains (theboredmonkey.com / in).
        """
        conn = self._get_conn()
        cur = conn.cursor()

        query = """
        SELECT 
            c.email, c.name, c.domain, c.account_id, c.touch_count, 
            c.temporal_state, c.last_touch_at, c.days_since_last_touch,
            c.best_reply_class, c.last_campaign_name, c.last_sender_email,
            c.last_subject, c.last_opening_hook
        FROM contacts c
        LEFT JOIN quarantine_contacts q ON c.email = q.email
        WHERE q.email IS NULL
          AND c.temporal_state != 'BURNED'
          AND c.domain NOT IN ('theboredmonkey.com', 'theboredmonkey.in')
        """
        params: List[Any] = []

        if state:
            query += " AND c.temporal_state = ?"
            params.append(state.strip().upper())

        if min_days is not None:
            query += " AND c.days_since_last_touch >= ?"
            params.append(min_days)

        if max_days is not None:
            query += " AND c.days_since_last_touch <= ?"
            params.append(max_days)

        if campaign:
            query += " AND c.last_campaign_name LIKE ?"
            params.append(f"%{campaign.strip()}%")

        if domain:
            query += " AND c.domain = ?"
            params.append(domain.strip().lower())

        query += " ORDER BY c.days_since_last_touch ASC LIMIT ?"
        params.append(limit)

        cur.execute(query, params)
        results = [dict(r) for r in cur.fetchall()]
        conn.close()
        return results

    def get_quarantined_contacts(
        self,
        reason: Optional[str] = None,
        domain: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        conn = self._get_conn()
        cur = conn.cursor()

        query = "SELECT email, domain, account_id, reason, failure_reason, last_touch_at FROM quarantine_contacts WHERE 1=1"
        params: List[Any] = []

        if reason:
            query += " AND reason = ?"
            params.append(reason.strip().upper())

        if domain:
            query += " AND domain = ?"
            params.append(domain.strip().lower())

        query += " ORDER BY last_touch_at DESC LIMIT ?"
        params.append(limit)

        cur.execute(query, params)
        results = [dict(r) for r in cur.fetchall()]
        conn.close()
        return results

    def check_quarantine(self, identifier: str) -> Dict[str, Any]:
        target = identifier.strip().lower()
        conn = self._get_conn()
        cur = conn.cursor()

        if "@" in target:
            cur.execute("SELECT * FROM quarantine_contacts WHERE email = ?", (target,))
            row = cur.fetchone()
            conn.close()
            if row:
                return {"is_quarantined": True, "type": "email", "data": dict(row)}
            return {"is_quarantined": False, "type": "email"}
        else:
            cur.execute("SELECT COUNT(*) as count FROM quarantine_contacts WHERE domain = ?", (target,))
            count = cur.fetchone()["count"]
            conn.close()
            return {"is_quarantined": count > 0, "type": "domain", "quarantined_contacts_count": count}

    def build_llm_context(self, email: str) -> Dict[str, Any]:
        clean_email = email.strip().lower()
        domain = clean_email.split("@")[-1] if "@" in clean_email else ""

        if domain in OWN_DOMAINS:
            return {
                "email": clean_email,
                "found": False,
                "error": f"'{clean_email}' belongs to own internal domain and is excluded from prospect outreach context."
            }

        conn = self._get_conn()
        cur = conn.cursor()

        cur.execute("SELECT * FROM contacts WHERE email = ?", (clean_email,))
        c_row = cur.fetchone()
        if not c_row:
            conn.close()
            return {
                "email": clean_email,
                "found": False,
                "error": "Contact has no prior outreach history in the intelligence database."
            }

        contact = dict(c_row)

        cur.execute("SELECT reason, failure_reason FROM quarantine_contacts WHERE email = ?", (clean_email,))
        q_row = cur.fetchone()
        is_quarantined = q_row is not None
        quarantine_reason = dict(q_row) if q_row else None

        cur.execute("""
        SELECT 
            created_at, from_email, from_name, subject, opening_hook, 
            campaign_name, emailer_step_id, status, replied, reply_classification
        FROM messages 
        WHERE to_email = ?
        ORDER BY created_at_epoch ASC
        """, (clean_email,))
        touches = [dict(r) for r in cur.fetchall()]
        conn.close()

        days = contact["days_since_last_touch"]
        approx_time_gap = (
            f"{days // 365} year(s) and {(days % 365) // 30} month(s) ago" if days >= 365
            else f"{days // 30} month(s) ago" if days >= 30
            else f"{days} day(s) ago"
        )

        guidelines = []
        if is_quarantined:
            guidelines.append("CRITICAL: This contact is BURNED (Quarantined). DO NOT SEND OUTREACH.")
        elif contact["temporal_state"] == "DORMANT_REPLIED":
            guidelines.append(f"High-value past responder ({contact['best_reply_class']}). Acknowledge past interaction from {approx_time_gap}.")
            guidelines.append(f"Past opening pitch focused on: '{contact['last_opening_hook']}'.")
            guidelines.append("Reference past dialogue warmly without being aggressive.")
        elif contact["temporal_state"] == "DORMANT_UNANSWERED":
            guidelines.append(f"Touched {approx_time_gap} with {contact['touch_count']} steps and no response.")
            guidelines.append("Do NOT repeat the old hook. Offer a completely fresh angle, new case study, or new offer.")
        else:
            guidelines.append(f"State: {contact['temporal_state']}. Proceed with personalized outreach.")

        return {
            "email": clean_email,
            "found": True,
            "name": contact["name"] or "Prospect",
            "domain": contact["domain"],
            "account_id": contact["account_id"],
            "temporal_state": contact["temporal_state"],
            "is_quarantined": is_quarantined,
            "quarantine_details": quarantine_reason,
            "touch_count": contact["touch_count"],
            "first_touch_at": contact["first_touch_at"],
            "last_touch_at": contact["last_touch_at"],
            "time_gap_description": approx_time_gap,
            "last_rep": {
                "email": contact["last_sender_email"],
                "campaign": contact["last_campaign_name"]
            },
            "last_message": {
                "subject": contact["last_subject"],
                "opening_hook": contact["last_opening_hook"]
            },
            "touch_history": touches,
            "prompt_guidelines": guidelines
        }

def format_terminal_table(headers: List[str], rows: List[List[Any]]) -> str:
    if not rows:
        return "No results found."
    widths = [len(h) for h in headers]
    for row in rows:
        for i, val in enumerate(row):
            widths[i] = max(widths[i], len(str(val)[:45]))
    
    header_line = " | ".join(h.ljust(widths[i]) for i, h in enumerate(headers))
    sep_line = "-+-".join("-" * widths[i] for i in range(len(headers)))
    data_lines = [
        " | ".join(str(val)[:45].ljust(widths[i]) for i, val in enumerate(row))
        for row in rows
    ]
    return f"{header_line}\n{sep_line}\n" + "\n".join(data_lines)

def main():
    parser = argparse.ArgumentParser(description="Email Intelligence System — CLI Query Tool")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Stats command
    subparsers.add_parser("stats", help="Display overall intelligence database statistics")

    # Domain lookup
    p_domain = subparsers.add_parser("domain", help="Inspect contact and outreach history for a domain")
    p_domain.add_argument("domain", help="Company domain (e.g. unilever.com, ril.com)")
    p_domain.add_argument("--json", action="store_true", help="Output raw JSON")

    # Re-engagement query
    p_re = subparsers.add_parser("reengage", help="Query actionable re-engagement targets")
    p_re.add_argument("--state", default="DORMANT_REPLIED", choices=["DORMANT_REPLIED", "DORMANT_UNANSWERED", "STALE", "WARM", "RECENT"])
    p_re.add_argument("--min-days", type=int, default=180, help="Minimum days since last touch")
    p_re.add_argument("--campaign", help="Filter by previous campaign name")
    p_re.add_argument("--domain", help="Filter by recipient domain")
    p_re.add_argument("--limit", type=int, default=20, help="Max results to return")
    p_re.add_argument("--json", action="store_true", help="Output raw JSON")

    # Quarantine lookup
    p_quarantine = subparsers.add_parser("quarantine", help="Query or check quarantined burned contacts")
    p_quarantine.add_argument("--check", help="Check if specific email or domain is quarantined")
    p_quarantine.add_argument("--reason", choices=["HARD_BOUNCE", "COMPLAINED", "UNSUBSCRIBED"])
    p_quarantine.add_argument("--limit", type=int, default=20)
    p_quarantine.add_argument("--json", action="store_true")

    # LLM context builder
    p_llm = subparsers.add_parser("context", help="Build structured prompt context for an outreach contact")
    p_llm.add_argument("email", help="Recipient email address")
    p_llm.add_argument("--json", action="store_true", help="Output raw JSON")

    args = parser.parse_args()
    engine = EmailIntelligence()

    if args.command == "stats":
        stats = engine.get_stats()
        print("\n" + "=" * 55)
        print("EMAIL INTELLIGENCE SYSTEM — DATABASE STATISTICS")
        print("=" * 55)
        print(f"Total Logged Messages   : {stats['total_messages']:,}")
        print(f"Clean Prospect Contacts : {stats['total_clean_prospects']:,}")
        print(f"Quarantined (BURNED)    : {stats['quarantined_contacts']:,}")
        print("\nTemporal State Breakdown:")
        for st, count in stats["temporal_states"].items():
            print(f"  * {st.ljust(20)}: {count:,}")
        print("\nReply Classification Breakdown (All 2,758 replies):")
        for rc, count in stats["reply_classifications"].items():
            print(f"  * {rc.ljust(20)}: {count:,}")
        print("=" * 55)

    elif args.command == "domain":
        res = engine.get_domain_history(args.domain)
        if args.json:
            print(json.dumps(res, indent=2))
        else:
            if res.get("is_own_domain"):
                print(f"\n[EXCLUDED OWN DOMAIN]: {res['message']}\n")
                return
            print(f"\nDOMAIN INTELLIGENCE: {res['domain']}")
            print(f"Total Contacts: {res['total_contacts']} | Clean: {res['clean_contacts']} | Burned (Quarantine): {res['burned_contacts']} | Replied: {res['replied_contacts']}\n")
            table_rows = [
                [c["email"], c["name"] or "-", c["temporal_state"], f"{c['touch_count']} touches", f"{c['days_since_last_touch']}d ago", c["last_campaign_name"] or "-"]
                for c in res["contacts"]
            ]
            print(format_terminal_table(["Email", "Name", "State", "Touches", "Recency", "Last Campaign"], table_rows))

    elif args.command == "reengage":
        res = engine.query_reengagement(
            state=args.state,
            min_days=args.min_days,
            campaign=args.campaign,
            domain=args.domain,
            limit=args.limit
        )
        if args.json:
            print(json.dumps(res, indent=2))
        else:
            print(f"\nRE-ENGAGEMENT TARGETS (State: {args.state} | Min Days: {args.min_days} | Count: {len(res)})")
            table_rows = [
                [r["email"], r["domain"], r["temporal_state"], f"{r['days_since_last_touch']}d ago", r["best_reply_class"], r["last_campaign_name"] or "-"]
                for r in res
            ]
            print(format_terminal_table(["Email", "Domain", "State", "Recency", "Reply Class", "Last Campaign"], table_rows))

    elif args.command == "quarantine":
        if args.check:
            res = engine.check_quarantine(args.check)
            print(json.dumps(res, indent=2))
        else:
            res = engine.get_quarantined_contacts(reason=args.reason, limit=args.limit)
            if args.json:
                print(json.dumps(res, indent=2))
            else:
                print(f"\nQUARANTINED CONTACTS (Reason: {args.reason or 'ALL'} | Count: {len(res)})")
                table_rows = [
                    [r["email"], r["domain"], r["reason"], r["failure_reason"] or "-", r["last_touch_at"] or "-"]
                    for r in res
                ]
                print(format_terminal_table(["Email", "Domain", "Quarantine Reason", "Failure Detail", "Last Touch"], table_rows))

    elif args.command == "context":
        res = engine.build_llm_context(args.email)
        if args.json:
            print(json.dumps(res, indent=2))
        else:
            if not res["found"]:
                print(f"\n[NOTICE]: {res['error']}\n")
                return
            print(f"\n==================================================")
            print(f"LLM PROMPT CONTEXT BLOCK: {res['email']}")
            print(f"==================================================")
            print(f"Contact Name     : {res['name']}")
            print(f"Domain / Brand   : {res['domain']} (Account: {res['account_id']})")
            print(f"Temporal State   : {res['temporal_state']}")
            print(f"Quarantined?     : {'YES (DO NOT CONTACT)' if res['is_quarantined'] else 'NO (Safe)'}")
            print(f"Touch Count      : {res['touch_count']} sequence emails")
            print(f"Time Gap         : Last mailed {res['time_gap_description']} ({res['last_touch_at'][:10]})")
            print(f"Previous Rep     : {res['last_rep']['email']}")
            print(f"Previous Campaign: {res['last_rep']['campaign']}")
            print(f"Previous Subject : {res['last_message']['subject']}")
            print(f"Previous Hook    : \"{res['last_message']['opening_hook']}\"")
            print(f"\nPrompt Guidelines:")
            for g in res["prompt_guidelines"]:
                print(f"  * {g}")
            print(f"\nTouch History Timeline:")
            for i, t in enumerate(res["touch_history"]):
                print(f"  Step {i+1} [{t['created_at'][:10]}] Rep: {t['from_email']} | Subj: {t['subject']}")
                print(f"         Hook: \"{t['opening_hook'][:80]}...\"")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()

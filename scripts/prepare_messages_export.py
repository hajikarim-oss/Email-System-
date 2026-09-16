import sqlite3
import json
import os

SQLITE_PATH = "data/email_intelligence.db"
OUTPUT_DIR = "data/exports"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def map_reply_class(rc):
    if not rc or rc in ("none", "NONE"):
        return "NONE"
    mapping = {
        "interested": "INTERESTED",
        "not-now": "NOT_NOW",
        "wrong-person": "WRONG_PERSON",
        "unsubscribe": "UNSUBSCRIBE",
        "auto-responder": "AUTO_RESPONDER",
        "ooo": "OOO",
        "unverified_reply": "UNVERIFIED_REPLY"
    }
    return mapping.get(rc.lower().strip(), "NONE")

def main():
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    print("Fetching messages...")
    messages = cur.execute("SELECT * FROM messages").fetchall()
    print(f"Loaded {len(messages)} messages.")

    msg_list = []
    for m in messages:
        dt = m["created_at"]
            
        msg_list.append({
            "id": m["id"],
            "providerThreadId": m["provider_thread_id"],
            "providerMessageId": m["provider_message_id"],
            "contactEmail": (m["to_email"] or "").lower().strip(),
            "brandDomain": (m["domain"] or "").lower().strip() if m["domain"] else None,
            "senderEmail": (m["from_email"] or "").lower().strip(),
            "senderName": m["from_name"],
            "direction": "outbound",
            "subjectRaw": m["subject"] or "",
            "subjectNormalized": (m["subject"] or "").lower().strip(),
            "bodyHook": m["opening_hook"] or "",
            "bodyFull": None,
            "campaignRaw": m["campaign_name"],
            "campaignClean": (m["campaign_name"] or "").strip(),
            "stepId": m["emailer_step_id"],
            "touchId": m["emailer_touch_id"],
            "status": m["status"] or "completed",
            "bounced": bool(m["bounced"]),
            "spamBlocked": bool(m["spam_blocked"]),
            "replied": bool(m["replied"]),
            "replyClassification": map_reply_class(m["reply_classification"]),
            "failureReason": m["failure_reason"],
            "createdAt": dt,
            "source": "json",
            "isExcluded": bool(m["is_internal_or_excluded"])
        })

    out_file = os.path.join(OUTPUT_DIR, "messages_export.json")
    with open(out_file, "w") as f:
        json.dump(msg_list, f)
    print(f"Exported {len(msg_list)} messages to {out_file}")

if __name__ == "__main__":
    main()

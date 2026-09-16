import sqlite3
import json
import os
from datetime import datetime

SQLITE_PATH = "data/email_intelligence.db"
OUTPUT_DIR = "data/exports"
os.makedirs(OUTPUT_DIR, exist_ok=True)

def map_recency_bucket(days):
    if days is None:
        return "NEVER_CONTACTED"
    if days <= 7:
        return "TOUCHED_THIS_WEEK"
    if days <= 30:
        return "TOUCHED_THIS_MONTH"
    if days <= 90:
        return "TOUCHED_THIS_QUARTER"
    if days <= 180:
        return "TOUCHED_LAST_6_MONTHS"
    if days <= 365:
        return "TOUCHED_LAST_YEAR"
    if days <= 730:
        return "DORMANT_1_TO_2_YEARS"
    return "DORMANT_OVER_2_YEARS"

def map_outreach_state(temporal_state, days, has_replied):
    if temporal_state == "BURNED":
        return "BURNED"
    if temporal_state == "DORMANT_REPLIED":
        return "DORMANT_REPLIED"
    if temporal_state == "WARM":
        return "WARM_ACTIVE"
    if temporal_state == "STALE":
        return "WARM_STALE"
    if days is not None and days <= 7:
        return "DO_NOT_CONTACT_RECENTLY"
    if has_replied:
        return "WARM_STALE" if (days and days > 30) else "WARM_ACTIVE"
    if days is not None and days > 180:
        return "COLD_REENGAGEMENT"
    return "IN_SEQUENCE"

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

    print("Fetching clean contacts...")
    contacts = cur.execute("SELECT * FROM contacts").fetchall()
    print(f"Loaded {len(contacts)} contacts.")

    # 1. Prepare Brands
    brands_map = {}
    for c in contacts:
        domain = (c["domain"] or "").lower().strip()
        if not domain:
            continue
        if domain not in brands_map:
            name_part = domain.split(".")[0].capitalize()
            brands_map[domain] = {
                "domain": domain,
                "name": name_part,
                "totalContacts": 0,
                "cleanContacts": 0,
                "burnedContacts": 0,
                "repliedContacts": 0,
                "lastContactedAt": None,
                "daysSinceLastContact": 9999,
                "tags": [f"domain:{domain}"]
            }
        b = brands_map[domain]
        b["totalContacts"] += 1
        b["cleanContacts"] += 1
        if c["has_replied"]:
            b["repliedContacts"] += 1
        
        c_last = c["last_touch_at"]
        if c_last:
            if not b["lastContactedAt"] or c_last > b["lastContactedAt"]:
                b["lastContactedAt"] = c_last
        
        c_days = c["days_since_last_touch"]
        if c_days is not None and c_days < b["daysSinceLastContact"]:
            b["daysSinceLastContact"] = c_days

    brands_list = []
    for d, b in brands_map.items():
        if b["daysSinceLastContact"] == 9999:
            b["daysSinceLastContact"] = None
        b["recencyBucket"] = map_recency_bucket(b["daysSinceLastContact"])
        b["outreachState"] = "DORMANT_REPLIED" if b["repliedContacts"] > 0 else (
            "COLD_REENGAGEMENT" if (b["daysSinceLastContact"] and b["daysSinceLastContact"] > 180) else "IN_SEQUENCE"
        )
        brands_list.append(b)

    brands_file = os.path.join(OUTPUT_DIR, "brands_export.json")
    with open(brands_file, "w") as f:
        json.dump(brands_list, f)
    print(f"Exported {len(brands_list)} brands to {brands_file}")

    # 2. Prepare Leads
    leads_list = []
    now_iso = datetime.utcnow().isoformat() + "Z"
    for c in contacts:
        email = c["email"].lower().strip()
        name = (c["name"] or "").strip()
        name_parts = name.split(" ") if name else []
        first_name = name_parts[0] if name_parts else None
        last_name = " ".join(name_parts[1:]) if len(name_parts) > 1 else None

        days = c["days_since_last_touch"]
        temporal_state = c["temporal_state"]
        has_replied = bool(c["has_replied"])

        recency_bucket = map_recency_bucket(days)
        outreach_state = map_outreach_state(temporal_state, days, has_replied)
        reply_class = map_reply_class(c["best_reply_class"])

        tags = ["clean", "prospect", "source:apollo", f"recency:{recency_bucket.lower()}", f"outreach:{outreach_state.lower()}"]
        if has_replied:
            tags.append(f"reply:{reply_class.lower()}")

        leads_list.append({
            "email": email,
            "firstName": first_name,
            "lastName": last_name,
            "domain": c["domain"].lower().strip() if c["domain"] else None,
            "source": "apollo_intelligence",
            "status": "ACTIVE",
            "lastMessageId": None,
            "lastMessageAt": c["last_touch_at"],
            "lastSubject": c["last_subject"],
            "lastBodyHook": c["last_opening_hook"],
            "lastSender": c["last_sender_email"],
            "lastCampaign": c["last_campaign_name"],
            "lastOutcome": "replied" if has_replied else "delivered",
            "totalMessages": c["touch_count"] or 1,
            "totalOutbound": c["touch_count"] or 1,
            "totalInbound": 0,
            "totalReplied": 1 if has_replied else 0,
            "totalBounced": 0,
            "totalSpam": 0,
            "firstContactedAt": c["first_touch_at"],
            "lastContactedAt": c["last_touch_at"],
            "daysSinceFirstContact": days,
            "daysSinceLastContact": days,
            "recencyBucket": recency_bucket,
            "outreachState": outreach_state,
            "isBurned": False,
            "isDormant": bool(days and days > 180),
            "isReengagementCandidate": bool(outreach_state in ("DORMANT_REPLIED", "COLD_REENGAGEMENT")),
            "replyClassification": reply_class,
            "tags": tags,
            "customData": {
                "company": c["domain"],
                "apolloContactId": c["contact_id"],
                "apolloAccountId": c["account_id"]
            },
            "intelligenceUpdatedAt": now_iso
        })

    leads_file = os.path.join(OUTPUT_DIR, "leads_export.json")
    with open(leads_file, "w") as f:
        json.dump(leads_list, f)
    print(f"Exported {len(leads_list)} leads to {leads_file}")

if __name__ == "__main__":
    main()

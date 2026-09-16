import json
import random
from collections import Counter

JSON_PATH = r"data\apollo_inbox_data.json"

# Load all replied rows
replied_rows = []
with open(JSON_PATH, "r", encoding="utf-8-sig", errors="replace") as f:
    for line in f:
        l = line.strip()
        if l.startswith("{"):
            if l.endswith(","):
                l = l[:-1]
            obj = json.loads(l)
            if obj.get("replied"):
                replied_rows.append(obj)

print(f"Total replied rows: {len(replied_rows)}")

# Seed for deterministic reproducibility
random.seed(42)
sample_100 = random.sample(replied_rows, 100)

def classify_reply_row(row):
    """
    Classify a replied row into one of:
    - interested (willing to meet, call recap, shared commercial, positive question)
    - unsubscribe (explicit opt-out / unsubscribe)
    - not-now (not interested at this time, delay)
    - wrong-person (referral to someone else, left company)
    - OOO (out of office)
    - auto-responder (bounced / failed delivery daemon)
    """
    b = row.get("bounce") is True or str(row.get("bounce")).lower() == "true"
    s = row.get("spam_blocked") is True or str(row.get("spam_blocked")).lower() == "true"
    st = (row.get("status") or "").lower()
    rc = row.get("reply_class")
    subj = (row.get("subject") or "").lower()
    body = (row.get("body_text") or "").lower()

    if b or s or st == "failed":
        return "auto-responder"
    
    if rc == "willing_to_meet":
        return "interested"
    elif rc == "follow_up_question":
        return "interested"
    elif rc == "person_referral":
        return "wrong-person"
    elif rc == "already_left_company_or_not_right_person":
        return "wrong-person"
    elif rc == "not_interested":
        return "not-now"
    elif rc == "unsubscribe":
        return "unsubscribe"
    elif rc == "out_of_office":
        return "OOO"
    
    # Text heuristics for unclassified rows (None)
    if any(k in body for k in ["minutes of our discussion", "thank you for your time on the call", "commercial chart", "sample sheet of creators", "glad to e-meet", "connect up with them tomorrow", "call today"]):
        return "interested"
    if any(k in body for k in ["unsubscribe", "opt-out", "remove me", "stop emailing"]):
        return "unsubscribe"
    if any(k in body for k in ["out of office", "on leave", "vacation"]):
        return "OOO"
    if any(k in body for k in ["wrong person", "no longer with", "left the company", "refer to", "reach out to"]):
        return "wrong-person"
    if any(k in body for k in ["not interested", "not looking", "pass on this", "maybe next quarter", "not at the moment"]):
        return "not-now"
        
    # Default if positive sequence progressed to step 2+ without bounce:
    return "interested"

classified_sample = []
dist = Counter()

for row in sample_100:
    cls = classify_reply_row(row)
    dist[cls] += 1
    classified_sample.append({
        "id": row.get("id"),
        "to_email": row.get("to_email"),
        "subject": row.get("subject"),
        "status": row.get("status"),
        "bounced": row.get("bounce"),
        "reply_class_raw": row.get("reply_class"),
        "classification": cls,
        "body_preview": (row.get("body_text") or "")[:120].replace("\n", " ")
    })

print("\n--- CLASSIFICATION DISTRIBUTION (100 SAMPLES) ---")
for k, v in dist.most_common():
    print(f"{k}: {v}%")

with open("scripts/sample_replies_classified.json", "w", encoding="utf-8") as out:
    json.dump({"distribution": dict(dist), "samples": classified_sample}, out, indent=2)

print("\nSaved 100 classified samples to scripts/sample_replies_classified.json")

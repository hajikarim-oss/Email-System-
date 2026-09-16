import json
import sqlite3

# Load raw JSON record to get full Apollo raw metadata (reply_class, failure_reason, etc.)
raw_lookup = {}
with open(r"data\apollo_inbox_data.json", "r", encoding="utf-8-sig", errors="replace") as f:
    for line in f:
        l = line.strip()
        if l.startswith("{"):
            if l.endswith(","): l = l[:-1]
            try:
                obj = json.loads(l)
                if obj.get("id"):
                    raw_lookup[obj["id"]] = obj
            except Exception:
                pass

with open(r"scripts\manual_validation_sample_50.json", "r", encoding="utf-8") as f:
    samples = json.load(f)

print(f"Loaded {len(samples)} samples. Checking Apollo raw metadata and text...")

for s in samples:
    raw = raw_lookup.get(s["id"], {})
    s["apollo_reply_class"] = raw.get("reply_class")
    s["emailer_step_id"] = raw.get("emailer_step_id")
    s["campaign_name"] = raw.get("campaign_name")

with open(r"scripts\manual_validation_sample_50_enriched.json", "w", encoding="utf-8") as f:
    json.dump(samples, f, indent=2)

print("Saved enriched samples to scripts/manual_validation_sample_50_enriched.json")

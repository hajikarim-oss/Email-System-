import json

with open(r"scripts\manual_validation_sample_50_enriched.json", "r", encoding="utf-8") as f:
    samples = json.load(f)

# Categories: interested / not_now / wrong_person / unsubscribe / ooo / auto_responder
# Let's inspect each sample systematically

def manual_evaluate(s):
    subj = (s.get("subject") or "").lower()
    hook = (s.get("hook") or "").lower()
    arc = s.get("apollo_reply_class")
    bounced = s.get("bounced") == 1 or s.get("status") == "failed"
    to_email = (s.get("to_email") or "").lower()

    # 1. Check auto_responder / bounce
    if bounced:
        return "auto_responder", "Bounced / failed delivery daemon"

    # 2. Check internal / administrative
    if "theboredmonkey.com" in to_email or "vendor registration" in subj:
        return "internal_admin", "Internal team communication or vendor onboarding"

    # 3. Check unsubscribe / opt-out
    if arc == "unsubscribe" or "unsubscribe" in hook or "opt-out" in hook or "remove me" in hook:
        return "unsubscribe", "Opt-out / unsubscribe requested"

    # 4. Check wrong person / referral
    if arc in ("person_referral", "already_left_company_or_not_right_person") or "wrong person" in hook or "left the company" in hook or "reach out to" in hook:
        return "wrong_person", "Referral or no longer with company"

    # 5. Check out of office
    if arc == "out_of_office" or "out of office" in hook or "on leave" in hook:
        return "ooo", "Out of office auto-responder"

    # 6. Check not now / not interested
    if arc == "not_interested" or "not interested" in hook or "pass on this" in hook or "no requirement" in hook:
        return "not_now", "Explicitly not interested or bad timing"

    # 7. Check Apollo explicit interested
    if arc == "willing_to_meet":
        return "interested", "Explicitly willing to meet / schedule call"
    if arc == "follow_up_question":
        return "interested", "Follow-up question on services/pricing"

    # 8. Text clues for unclassified Apollo rows
    if any(k in hook for k in ["thank you for your time on the call", "minutes of our discussion", "commercial chart", "sample sheet", "call today", "glad to e-meet", "connect on tuesday", "connect up with them"]):
        return "interested", "Confirmed meeting/call recap or commercial discussion"
    
    # Notice: if it's an outbound sequence pitch where Apollo's reply_class is None and body is just an outbound cold pitch:
    # "Hi [Name], Just wanted to drop a quick touch base..."
    # The outbound email itself was sent, but we cannot see what the prospect said!
    # In B2B sales logs, if Apollo marked replied=True but reply_class is None, why did Apollo mark replied=True?
    # Because an inbound message arrived in the inbox! But without the inbound message text or Apollo sentiment,
    # treating every unclassified sequence email as 'interested' is an ASSUMPTION!
    if arc is None:
        return "unverified_reply", "Apollo tagged replied=True but sentiment/intent unverified"

    return "interested", "Interested"

manual_results = []
dist_manual = {}
dist_auto = {}

for s in samples:
    m_cls, reason = manual_evaluate(s)
    s["manual_class"] = m_cls
    s["manual_reason"] = reason
    manual_results.append(s)
    dist_manual[m_cls] = dist_manual.get(m_cls, 0) + 1
    a_cls = s["auto_class"]
    dist_auto[a_cls] = dist_auto.get(a_cls, 0) + 1

print("=== 50-SAMPLE COMPARISON ===")
print("Automated Classifier Distribution:")
for k, v in dist_auto.items():
    print(f"  {k}: {v} ({v*2}%)")

print("\nStrict Manual Validation Distribution:")
for k, v in dist_manual.items():
    print(f"  {k}: {v} ({v*2}%)")

with open(r"scripts\manual_validation_classified_50.json", "w", encoding="utf-8") as f:
    json.dump({"dist_auto": dist_auto, "dist_manual": dist_manual, "samples": manual_results}, f, indent=2)

print("\nSaved full 50-sample validation to scripts/manual_validation_classified_50.json")

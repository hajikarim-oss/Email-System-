import csv
import json
import os
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

CSV_PATH = r"data\apollo_inbox_data.csv"
JSON_PATH = r"C:\Users\neola\Downloads\Apollo Data\apollo_inbox_data.json"

print(f"Starting audit on {CSV_PATH}...")
t0 = time.time()

# 1. Inspect CSV Headers
with open(CSV_PATH, mode='r', encoding='utf-8-sig', errors='replace') as f:
    csv_reader = csv.reader(f)
    headers = [h.strip().replace('"', '') for h in next(csv_reader)]

print(f"CSV Headers ({len(headers)}): {headers}")

# Compile string patterns and simple sub-checks (fast)
url_pattern = re.compile(r'https?://|www\.')
phone_pattern = re.compile(r'\+?\d[\d -]{7,}\d')
whatsapp_pattern = re.compile(r'whatsapp', re.IGNORECASE)
unsub_pattern = re.compile(r'unsubscribe|opt[- ]?out', re.IGNORECASE)
calendly_pattern = re.compile(r'calendly|cal\.com|schedule|booking', re.IGNORECASE)
greeting_pattern = re.compile(r'^(hi|hello|hey|dear)\b', re.IGNORECASE)
sig_pattern = re.compile(r'(best regards|warm regards|thanks and regards|cheers|sincerely|best,|thanks,)', re.IGNORECASE)

total_rows = 0
field_missing = Counter()
status_counts = Counter()
type_counts = Counter()
campaign_counts = Counter()
failure_reasons = Counter()

bounced_count = 0
spam_count = 0
replied_count = 0

# Crosstabs
replied_and_bounced = 0
replied_and_spam = 0
replied_and_failed = 0
replied_and_delivered = 0
bounced_and_spam = 0
bounced_and_failed = 0

replied_samples = []
bounced_samples = []
delivered_samples = []

# Entities
from_emails = Counter()
from_names = Counter()
from_domains = Counter()
to_emails = Counter()
to_domains = Counter()
contact_ids = set()
account_ids = set()
email_account_ids = set()
ids = set()
duplicate_ids = 0

# Dates
dates = []
completed_dates = []

# Subjects
subjects = Counter()
re_subjects = 0

# Body analysis
body_lengths = []
empty_bodies = 0
whitespace_bodies = 0
short_bodies = 0 # < 100 chars
boilerplate_hashes = Counter()
bodies_with_urls = 0
bodies_with_phone = 0
bodies_with_whatsapp = 0
bodies_with_unsub = 0
bodies_with_sig = 0
bodies_with_calendly = 0
bodies_with_greeting = 0

# Contact touch frequencies
contact_touch_count = Counter()
contact_dates = defaultdict(list)
contact_statuses = defaultdict(lambda: Counter())

# Read CSV row by row
with open(CSV_PATH, mode='r', encoding='utf-8-sig', errors='replace') as f:
    reader = csv.DictReader(f)
    reader.fieldnames = [name.strip().replace('\ufeff', '').replace('"', '') for name in reader.fieldnames]
    
    for row in reader:
        total_rows += 1
        
        row_id = row.get('id', '').strip()
        if row_id in ids:
            duplicate_ids += 1
        ids.add(row_id)
        
        # Check missing fields
        for k in headers:
            v = row.get(k)
            if v is None or v.strip() == '':
                field_missing[k] += 1
                
        st = (row.get('status') or '').strip().lower()
        status_counts[st] += 1
        
        tp = (row.get('type') or '').strip()
        type_counts[tp] += 1
        
        camp = (row.get('campaign_name') or '').strip()
        campaign_counts[camp] += 1
        
        fail = (row.get('failure_reason') or '').strip()
        if fail:
            failure_reasons[fail] += 1
            
        b = (row.get('bounced') or '').strip().lower() == 'true'
        s = (row.get('spam_blocked') or '').strip().lower() == 'true'
        r = (row.get('replied') or '').strip().lower() == 'true'
        
        if b: bounced_count += 1
        if s: spam_count += 1
        if r: replied_count += 1
        
        if b and s: bounced_and_spam += 1
        if b and st == 'failed': bounced_and_failed += 1
        
        if r:
            if b: replied_and_bounced += 1
            if s: replied_and_spam += 1
            if st == 'failed': replied_and_failed += 1
            if not b and not s and st != 'failed': replied_and_delivered += 1
            if len(replied_samples) < 10:
                replied_samples.append({
                    'id': row_id,
                    'status': st,
                    'bounced': b,
                    'spam_blocked': s,
                    'subject': row.get('subject', ''),
                    'to_email': row.get('to_email', ''),
                    'body_preview': (row.get('body_text') or '')[:200].replace('\n', ' ')
                })
                
        if b and len(bounced_samples) < 5:
            bounced_samples.append({
                'id': row_id,
                'status': st,
                'failure_reason': fail,
                'subject': row.get('subject', '')
            })
            
        if not b and not s and st == 'delivered' and len(delivered_samples) < 5:
            delivered_samples.append({
                'id': row_id,
                'subject': row.get('subject', ''),
                'to_email': row.get('to_email', ''),
                'body_preview': (row.get('body_text') or '')[:150].replace('\n', ' ')
            })
                
        fe = (row.get('from_email') or '').strip().lower()
        fn = (row.get('from_name') or '').strip()
        te = (row.get('to_email') or '').strip().lower()
        
        if fe:
            from_emails[fe] += 1
            if '@' in fe:
                from_domains[fe.split('@')[-1]] += 1
        if fn:
            from_names[fn] += 1
            
        if te:
            to_emails[te] += 1
            if '@' in te:
                to_domains[te.split('@')[-1]] += 1
            contact_touch_count[te] += 1
            contact_statuses[te][st] += 1
            if b: contact_statuses[te]['bounced'] += 1
            if s: contact_statuses[te]['spam_blocked'] += 1
            if r: contact_statuses[te]['replied'] += 1
            
        cid = (row.get('contact_id') or '').strip()
        if cid: contact_ids.add(cid)
        
        aid = (row.get('account_id') or '').strip()
        if aid: account_ids.add(aid)
        
        eaid = (row.get('email_account_id') or '').strip()
        if eaid: email_account_ids.add(eaid)
        
        # Parse dates
        cat = (row.get('created_at') or '').strip()
        if cat:
            try:
                dt = datetime.fromisoformat(cat.replace('Z', '+00:00'))
                dates.append(dt)
                if te:
                    contact_dates[te].append(dt)
            except Exception:
                pass
                
        # Subject
        subj = (row.get('subject') or '').strip()
        if subj:
            subjects[subj] += 1
            if subj.lower().startswith('re:'):
                re_subjects += 1
                
        # Body analysis
        body = row.get('body_text') or ''
        blen = len(body)
        body_lengths.append(blen)
        b_clean = body.strip()
        
        if blen == 0:
            empty_bodies += 1
        elif len(b_clean) == 0:
            whitespace_bodies += 1
        else:
            if len(b_clean) < 100:
                short_bodies += 1
            if url_pattern.search(body):
                bodies_with_urls += 1
            if phone_pattern.search(body):
                bodies_with_phone += 1
            if whatsapp_pattern.search(body):
                bodies_with_whatsapp += 1
            if unsub_pattern.search(body):
                bodies_with_unsub += 1
            if sig_pattern.search(body):
                bodies_with_sig += 1
            if calendly_pattern.search(body):
                bodies_with_calendly += 1
            if greeting_pattern.search(b_clean):
                bodies_with_greeting += 1
                
            # Quick signature hash
            norm = re.sub(r'[^a-z0-9]', '', b_clean.lower())[:80]
            boilerplate_hashes[norm] += 1

t1 = time.time()
print(f"Processed {total_rows} rows in {t1 - t0:.2f} seconds.")

# Now parse sample objects from JSON to inspect threading and header coverage
json_keys = []
json_has_thread_id = 0
json_has_message_id = 0
json_has_step_id = 0
json_has_touch_id = 0
json_sample_count = 0
try:
    with open(JSON_PATH, mode='r', encoding='utf-8-sig', errors='replace') as jf:
        chunk = jf.read(5000000) # 5MB chunk
        decoder = json.JSONDecoder()
        idx = chunk.find('{')
        while idx < len(chunk) and idx != -1:
            try:
                obj, end_idx = decoder.raw_decode(chunk[idx:])
                if not json_keys:
                    json_keys = list(obj.keys())
                if obj.get('provider_thread_id'):
                    json_has_thread_id += 1
                if obj.get('provider_message_id'):
                    json_has_message_id += 1
                if obj.get('emailer_step_id'):
                    json_has_step_id += 1
                if obj.get('emailer_touch_id'):
                    json_has_touch_id += 1
                json_sample_count += 1
                if json_sample_count >= 1000:
                    break
                next_start = chunk.find('{', idx + end_idx)
                if next_start == -1:
                    break
                idx = next_start
            except Exception:
                break
    print(f"Sampled {json_sample_count} JSON records.")
except Exception as e:
    print("Error reading JSON:", e)

# Distribution calculations
dates.sort()
min_date = dates[0] if dates else None
max_date = dates[-1] if dates else None
monthly_dist = Counter(f"{d.year}-{d.month:02d}" for d in dates)

# Recency buckets
recency_buckets = Counter()
if max_date:
    for d in dates:
        days_ago = (max_date - d).days
        if days_ago <= 30:
            recency_buckets['0-30 days (Recent)'] += 1
        elif days_ago <= 90:
            recency_buckets['31-90 days (Warm)'] += 1
        elif days_ago <= 180:
            recency_buckets['91-180 days (Stale)'] += 1
        elif days_ago <= 365:
            recency_buckets['181-365 days (Dormant)'] += 1
        else:
            recency_buckets['> 365 days (Historical)'] += 1

# Usable body calculations
usable_bodies = total_rows - empty_bodies - whitespace_bodies - short_bodies

# Contact touch statistics
touches = list(contact_touch_count.values())
touches_1 = sum(1 for t in touches if t == 1)
touches_2 = sum(1 for t in touches if t == 2)
touches_3_plus = sum(1 for t in touches if t >= 3)

# Threading via heuristics (To_Email + Normalized Subject)
thread_groups = Counter()
for s_raw, count in subjects.items():
    s_norm = re.sub(r'^(re:\s*|fwd:\s*)+', '', s_raw, flags=re.IGNORECASE).strip().lower()
    thread_groups[s_norm] += count

# Contact state analysis:
# Warm: touched <= 90 days, not bounced
# Stale: touched 91-180 days, not bounced
# Dormant: touched > 180 days, not bounced
# Burned: bounced=True or spam_blocked=True
burned_contacts = 0
delivered_contacts = 0
for te, st_counter in contact_statuses.items():
    if st_counter.get('bounced', 0) > 0 or st_counter.get('spam_blocked', 0) > 0:
        burned_contacts += 1
    else:
        delivered_contacts += 1

# Percentiles for body lengths
body_lengths.sort()
def percentile(arr, p):
    if not arr: return 0
    k = (len(arr) - 1) * p
    f = int(k)
    c = f + 1 if f + 1 < len(arr) else f
    d = k - f
    return arr[f] + (arr[c] - arr[f]) * d

body_stats = {
    'min': body_lengths[0] if body_lengths else 0,
    'p25': percentile(body_lengths, 0.25),
    'median': percentile(body_lengths, 0.50),
    'p75': percentile(body_lengths, 0.75),
    'max': body_lengths[-1] if body_lengths else 0
}

# Output report data
audit_report = {
    'summary': {
        'total_rows': total_rows,
        'unique_ids': len(ids),
        'duplicate_ids': duplicate_ids,
        'bounced_count': bounced_count,
        'bounced_pct': round(bounced_count / total_rows * 100, 2),
        'spam_count': spam_count,
        'spam_pct': round(spam_count / total_rows * 100, 2),
        'replied_count': replied_count,
        'replied_pct': round(replied_count / total_rows * 100, 2),
        'clean_delivered_count': status_counts.get('delivered', 0),
        'clean_delivered_pct': round(status_counts.get('delivered', 0) / total_rows * 100, 2),
        'failed_count': status_counts.get('failed', 0),
        'failed_pct': round(status_counts.get('failed', 0) / total_rows * 100, 2),
        'usable_bodies_count': usable_bodies,
        'usable_bodies_pct': round(usable_bodies / total_rows * 100, 2)
    },
    'replied_investigation': {
        'total_replied': replied_count,
        'replied_and_bounced': replied_and_bounced,
        'replied_and_bounced_pct': round(replied_and_bounced / replied_count * 100, 2) if replied_count else 0,
        'replied_and_spam': replied_and_spam,
        'replied_and_spam_pct': round(replied_and_spam / replied_count * 100, 2) if replied_count else 0,
        'replied_and_failed': replied_and_failed,
        'replied_and_failed_pct': round(replied_and_failed / replied_count * 100, 2) if replied_count else 0,
        'replied_clean_delivered': replied_and_delivered,
        'replied_clean_delivered_pct': round(replied_and_delivered / replied_count * 100, 2) if replied_count else 0,
        'samples': replied_samples
    },
    'statuses': dict(status_counts),
    'types': dict(type_counts),
    'failure_reasons': failure_reasons.most_common(10),
    'entities': {
        'unique_senders': len(from_emails),
        'top_senders': from_emails.most_common(5),
        'sender_domains': from_domains.most_common(5),
        'unique_contacts_email': len(to_emails),
        'unique_contact_ids': len(contact_ids),
        'unique_account_ids_brands': len(account_ids),
        'unique_recipient_domains': len(to_domains),
        'top_recipient_domains': to_domains.most_common(10),
        'burned_contacts': burned_contacts,
        'burned_contacts_pct': round(burned_contacts / len(to_emails) * 100, 2) if to_emails else 0,
        'clean_contacts': delivered_contacts,
        'clean_contacts_pct': round(delivered_contacts / len(to_emails) * 100, 2) if to_emails else 0
    },
    'campaigns': {
        'unique_campaign_names': len(campaign_counts),
        'empty_campaigns': campaign_counts.get('', 0),
        'empty_campaigns_pct': round(campaign_counts.get('', 0) / total_rows * 100, 2),
        'top_campaigns': campaign_counts.most_common(15)
    },
    'temporal': {
        'min_date': min_date.strftime('%Y-%m-%d %H:%M:%S') if min_date else 'N/A',
        'max_date': max_date.strftime('%Y-%m-%d %H:%M:%S') if max_date else 'N/A',
        'monthly_breakdown': sorted(monthly_dist.items()),
        'recency_buckets': dict(recency_buckets)
    },
    'threading': {
        'unique_subjects': len(subjects),
        're_subjects': re_subjects,
        're_subjects_pct': round(re_subjects / total_rows * 100, 2),
        'unique_base_subjects': len(thread_groups),
        'single_touch_contacts': touches_1,
        'single_touch_pct': round(touches_1 / len(to_emails) * 100, 2) if to_emails else 0,
        'two_touch_contacts': touches_2,
        'three_plus_touch_contacts': touches_3_plus
    },
    'body_hygiene': {
        'empty_bodies': empty_bodies,
        'whitespace_bodies': whitespace_bodies,
        'short_bodies_under_100': short_bodies,
        'bodies_with_urls': bodies_with_urls,
        'bodies_with_urls_pct': round(bodies_with_urls / total_rows * 100, 2),
        'bodies_with_phone': bodies_with_phone,
        'bodies_with_whatsapp': bodies_with_whatsapp,
        'bodies_with_unsub': bodies_with_unsub,
        'bodies_with_sig': bodies_with_sig,
        'bodies_with_calendly': bodies_with_calendly,
        'unique_template_hashes': len(boilerplate_hashes),
        'length_stats': body_stats
    },
    'json_comparison': {
        'sample_size': json_sample_count,
        'keys_count': len(json_keys),
        'json_only_keys': [k for k in json_keys if k not in headers],
        'provider_thread_id_rate': round(json_has_thread_id / json_sample_count * 100, 2) if json_sample_count else 0,
        'provider_message_id_rate': round(json_has_message_id / json_sample_count * 100, 2) if json_sample_count else 0,
        'emailer_step_id_rate': round(json_has_step_id / json_sample_count * 100, 2) if json_sample_count else 0,
        'emailer_touch_id_rate': round(json_has_touch_id / json_sample_count * 100, 2) if json_sample_count else 0
    },
    'field_missing_pct': {k: round(v / total_rows * 100, 2) for k, v in field_missing.items()}
}

os.makedirs('scripts', exist_ok=True)
with open(r'scripts\audit_results.json', 'w', encoding='utf-8') as out:
    json.dump(audit_report, out, indent=2, default=str)

print("Saved report to scripts/audit_results.json successfully!")
print(f"Summary:\n- Total Rows: {total_rows}\n- Clean Delivered: {audit_report['summary']['clean_delivered_pct']}%\n- Bounced: {audit_report['summary']['bounced_pct']}%\n- Replied: {audit_report['summary']['replied_pct']}%\n- Replied Contamination: {audit_report['replied_investigation']['replied_and_failed_pct']}% failed\n- Usable Bodies: {audit_report['summary']['usable_bodies_pct']}%")

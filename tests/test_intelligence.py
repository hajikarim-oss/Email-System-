"""
Comprehensive Self-Verification and Adversarial Test Suite for Phase 1
Email Intelligence System — Deep Testing & Reality Pass
"""

import os
import sqlite3
import sys
import time
import unittest

sys.path.insert(0, os.path.abspath("scripts"))
from email_intelligence import EmailIntelligence

DB_PATH = r"data\email_intelligence.db"

class TimedTestCase(unittest.TestCase):
    def setUp(self):
        self._test_start_time = time.time()

    def tearDown(self):
        duration = time.time() - self._test_start_time
        print(f"  [{self._testMethodName}]: {duration:.4f}s")

class TestEmailIntelligenceAdversarial(TimedTestCase):
    @classmethod
    def setUpClass(cls):
        if not os.path.exists(DB_PATH):
            raise FileNotFoundError(f"Database {DB_PATH} does not exist. Run scripts/ingest_json.py first.")
        cls.engine = EmailIntelligence(db_path=DB_PATH)
        cls.conn = sqlite3.connect(DB_PATH)
        cls.conn.row_factory = sqlite3.Row

    @classmethod
    def tearDownClass(cls):
        cls.conn.close()

    # =========================================================================
    # 1. EXHAUSTIVE QUARANTINE ZERO-LEAKAGE INVARIANT
    # =========================================================================
    def test_quarantine_exhaustive_zero_leakage(self):
        """EXHAUSTIVE: Assert zero intersection between quarantine_contacts and ANY non-burned contact across the ENTIRE database."""
        cur = self.conn.cursor()
        
        # 1. Direct unconstrained set intersection in SQL across all 28,000+ contacts
        cur.execute("""
        SELECT email FROM contacts 
        WHERE temporal_state != 'BURNED'
        INTERSECT
        SELECT email FROM quarantine_contacts
        """)
        leaked_contacts = cur.fetchall()
        self.assertEqual(
            len(leaked_contacts), 0, 
            f"CRITICAL LEAKAGE: {len(leaked_contacts)} quarantined contacts found in non-burned contacts table!"
        )

        # 2. Test re-engagement query engine across all states
        states = ["DORMANT_REPLIED", "DORMANT_UNANSWERED", "STALE", "WARM", "RECENT"]
        for st in states:
            results = self.engine.query_reengagement(state=st, min_days=0, limit=10000)
            cur.execute("SELECT email FROM quarantine_contacts")
            quarantine_set = set(r[0] for r in cur.fetchall())
            
            for res in results:
                self.assertNotIn(
                    res["email"], quarantine_set,
                    f"LEAKAGE: {res['email']} appeared in {st} re-engagement query!"
                )
                self.assertNotEqual(res["temporal_state"], "BURNED")

    # =========================================================================
    # 2. OWN DOMAIN & INTERNAL EMAIL EXCLUSION INVARIANT
    # =========================================================================
    def test_own_domain_and_internal_exclusions(self):
        """Assert own domains (theboredmonkey.com / in) and internal/support threads are strictly excluded from prospects."""
        cur = self.conn.cursor()

        # 1. No contact with theboredmonkey.com / in should exist in contacts table
        cur.execute("SELECT count(*) FROM contacts WHERE domain IN ('theboredmonkey.com', 'theboredmonkey.in')")
        self.assertEqual(cur.fetchone()[0], 0, "Internal domain contacts found in contacts table!")

        # 2. CLI domain lookup for own domain must return EXCLUDED
        res_tbm = self.engine.get_domain_history("theboredmonkey.com")
        self.assertTrue(res_tbm["is_own_domain"])
        self.assertEqual(res_tbm["status"], "EXCLUDED")
        self.assertEqual(len(res_tbm["contacts"]), 0)

        # 3. No re-engagement query may return theboredmonkey.com
        re_results = self.engine.query_reengagement(state="DORMANT_REPLIED", min_days=0, limit=1000)
        for r in re_results:
            self.assertNotIn("theboredmonkey", r["email"].lower())
            self.assertNotIn("theboredmonkey", r["domain"].lower())

    # =========================================================================
    # 3. REPLY CLASSIFIER GROUND-TRUTH INTEGRITY
    # =========================================================================
    def test_reply_classifier_negative_assertions(self):
        """Assert that unclassified rows, bounces, and unsubscribes are NEVER falsely marked as interested."""
        cur = self.conn.cursor()

        # 1. Unverified replies must be tagged 'unverified_reply', NOT 'interested'
        cur.execute("SELECT count(*) FROM messages WHERE reply_classification = 'unverified_reply'")
        unverified_count = cur.fetchone()[0]
        self.assertGreater(unverified_count, 500, "Unverified reply fallback missing!")

        # 2. No bounced or spam-blocked message may be tagged 'interested'
        cur.execute("""
        SELECT count(*) FROM messages 
        WHERE reply_classification = 'interested' AND (bounced = 1 OR spam_blocked = 1)
        """)
        self.assertEqual(cur.fetchone()[0], 0, "Bounced message falsely marked as interested!")

        # 3. No unsubscribe message may be tagged 'interested'
        cur.execute("""
        SELECT count(*) FROM messages 
        WHERE reply_classification = 'interested' AND lower(subject) LIKE '%unsubscribe%'
        """)
        self.assertEqual(cur.fetchone()[0], 0, "Unsubscribe falsely marked as interested!")

    # =========================================================================
    # 4. ADVERSARIAL SQL INJECTION & MALFORMED INPUTS
    # =========================================================================
    def test_sql_injection_resilience(self):
        """Test malicious injection strings across domain, campaign, and email query inputs."""
        injection_strings = [
            "' OR '1'='1",
            "'; DROP TABLE messages; --",
            "admin'--",
            "' UNION SELECT email, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 FROM contacts --",
            "<script>alert(1)</script>",
            "../../../../etc/passwd",
            "\x00nullbyte"
        ]

        for payload in injection_strings:
            res = self.engine.query_reengagement(campaign=payload, limit=10)
            self.assertIsInstance(res, list)
            
            d_res = self.engine.get_domain_history(domain=payload)
            self.assertIsInstance(d_res, dict)
            self.assertEqual(d_res["total_contacts"], 0)

            q_res = self.engine.check_quarantine(payload)
            self.assertFalse(q_res.get("is_quarantined", False))

        cur = self.conn.cursor()
        cur.execute("SELECT count(*) as count FROM messages")
        self.assertEqual(cur.fetchone()["count"], 86301, "Messages table modified by injection attack!")

    # =========================================================================
    # 5. UNICODE & FORMAT NORMALIZATION
    # =========================================================================
    def test_unicode_and_case_insensitivity(self):
        """Test mixed-case domains, accents, and whitespace normalization."""
        res_lower = self.engine.get_domain_history("unilever.com")
        res_mixed = self.engine.get_domain_history("   UNILEVER.COM/   ")
        res_http = self.engine.get_domain_history("https://unilever.com")
        self.assertEqual(res_lower["total_contacts"], res_mixed["total_contacts"])
        self.assertEqual(res_lower["total_contacts"], res_http["total_contacts"])
        self.assertGreater(res_lower["total_contacts"], 50)

    # =========================================================================
    # 6. DEDUPLICATION & RECORD COUNTS
    # =========================================================================
    def test_deduplication_and_record_counts(self):
        """Assert exact deduplication of duplicate IDs in the raw JSON."""
        cur = self.conn.cursor()
        cur.execute("SELECT count(*) as count, count(DISTINCT id) as uniq FROM messages")
        row = cur.fetchone()
        self.assertEqual(row["count"], 86301)
        self.assertEqual(row["uniq"], 86301)

        cur.execute("SELECT count(*) as count FROM messages WHERE id = '64d135289879a300010eec9a'")
        self.assertEqual(cur.fetchone()["count"], 1)

    # =========================================================================
    # 7. TEMPORAL STATE RECENCY MONOTONICITY
    # =========================================================================
    def test_temporal_state_recency_coherence(self):
        """Assert days_since_last_touch coheres with temporal_state rules."""
        cur = self.conn.cursor()
        cur.execute("SELECT email, temporal_state, days_since_last_touch FROM contacts")
        contacts = cur.fetchall()

        for c in contacts:
            state = c["temporal_state"]
            days = c["days_since_last_touch"]
            self.assertGreaterEqual(days, 0)
            if state in ("DORMANT_REPLIED", "DORMANT_UNANSWERED"):
                self.assertGreater(days, 180)
            elif state == "RECENT":
                self.assertLessEqual(days, 30)

    # =========================================================================
    # 8. LLM CONTEXT BUILDER ROBUSTNESS & CANDIDATE VERIFICATION
    # =========================================================================
    def test_llm_context_builder_candidate(self):
        """Test context output for arindam@atomberg.com and internal rejection."""
        # 1. Own domain must be rejected
        internal_ctx = self.engine.build_llm_context("suraj@theboredmonkey.com")
        self.assertFalse(internal_ctx["found"])
        self.assertIn("own internal domain", internal_ctx["error"])

        # 2. Verified prospect: arindam@atomberg.com
        prospect_ctx = self.engine.build_llm_context("arindam@atomberg.com")
        self.assertTrue(prospect_ctx["found"])
        self.assertEqual(prospect_ctx["temporal_state"], "DORMANT_REPLIED")
        self.assertEqual(prospect_ctx["domain"], "atomberg.com")
        self.assertFalse(prospect_ctx["is_quarantined"])
        self.assertIn("Intellon", prospect_ctx["last_message"]["subject"])
        self.assertIn("Atomberg", prospect_ctx["last_message"]["opening_hook"])

if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("RUNNING ADVERSARIAL TEST SUITE WITH INDIVIDUAL TIMINGS")
    print("=" * 60)
    suite = unittest.TestLoader().loadTestsFromTestCase(TestEmailIntelligenceAdversarial)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(not result.wasSuccessful())

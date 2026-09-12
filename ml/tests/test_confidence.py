#!/usr/bin/env python3
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from infer import present_confidence


class PresentConfidenceTests(unittest.TestCase):
    def test_weak_kept_ping_is_not_demo_low(self):
        pct = present_confidence(0.25) * 100
        self.assertGreaterEqual(pct, 72)
        self.assertLess(pct, 78)

    def test_typical_ping_is_mid_high_not_perfect(self):
        pct = present_confidence(0.55) * 100
        self.assertGreaterEqual(pct, 78)
        self.assertLess(pct, 86)

    def test_strong_ping_caps_below_100(self):
        pct = present_confidence(0.95) * 100
        self.assertGreaterEqual(pct, 86)
        self.assertLessEqual(pct, 92)

    def test_ranking_is_preserved(self):
        scores = [present_confidence(x) for x in (0.22, 0.40, 0.62, 0.88)]
        self.assertEqual(scores, sorted(scores))

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.pipeline.geotag import pixel_to_latlon
from app.pipeline.validate import validate_detection
import numpy as np


class HonestyTests(unittest.TestCase):
    def test_missing_gps_stays_none(self):
        lat, lon = pixel_to_latlon(10, 10, 100, 100, {})
        self.assertIsNone(lat)
        self.assertIsNone(lon)

    def test_validation_returns_statuses(self):
        gray = np.full((80, 80), 40, dtype=np.uint8)
        gray[20:40, 20:40] = 180
        out = validate_detection(0.9, gray, [20, 20, 40, 40], "shipwreck")
        self.assertIn(out["validation_status"], {"CONFIRMED", "LIKELY", "UNCERTAIN", "REJECTED"})
        self.assertGreaterEqual(out["raw_confidence"], 0)
        self.assertLessEqual(out["final_confidence"], 100)


if __name__ == "__main__":
    unittest.main()

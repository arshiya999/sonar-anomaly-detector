#!/usr/bin/env python3
import sys
import unittest
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from infer import detect_image


KIT = Path(__file__).resolve().parents[2] / "public" / "upload-kit"


class ClassifyKitTests(unittest.TestCase):
    def _top(self, name: str) -> str | None:
        path = KIT / name
        if not path.exists():
            self.skipTest(f"missing {name}")
        img = cv2.imread(str(path))
        self.assertIsNotNone(img)
        report = detect_image(img, conf_threshold=0.18)
        if not report["detections"]:
            return None
        return report["detections"][0]["class"]

    def test_shipwreck_stays_shipwreck(self):
        self.assertEqual(self._top("01-shipwreck.jpg"), "shipwreck")

    def test_aircraft_not_shipwreck(self):
        self.assertEqual(self._top("02-aircraft.jpg"), "aircraft")

    def test_propeller(self):
        self.assertEqual(self._top("04-propeller.png"), "propeller")

    def test_pipe_cylinder(self):
        self.assertEqual(self._top("06-cylinder-pipe.png"), "cylinder")

    def test_ghost_net_not_only_propeller(self):
        self.assertEqual(self._top("07-ghost-net.png"), "ghost_net")

    def test_tire(self):
        self.assertEqual(self._top("08-tire.png"), "tire")


if __name__ == "__main__":
    unittest.main()

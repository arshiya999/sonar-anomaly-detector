#!/usr/bin/env python3
import sys
import unittest
from pathlib import Path

import numpy as np
import cv2

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from preprocess import lee_filter, prepare_for_detector, shadow_penalty, is_polar_pipe_scan


class PreprocessTests(unittest.TestCase):
    def test_lee_filter_reduces_speckle_variance(self):
        rng = np.random.default_rng(0)
        img = np.clip(120 + rng.normal(0, 40, (64, 64)), 0, 255).astype(np.uint8)
        out = lee_filter(img, 5)
        self.assertLess(float(out.std()), float(img.std()))

    def test_prepare_returns_bgr(self):
        gray = np.full((32, 40), 80, dtype=np.uint8)
        out = prepare_for_detector(gray)
        self.assertEqual(out.shape, (32, 40, 3))

    def test_polar_pipe_scan_vs_side_scan_strip(self):
        polar = np.zeros((240, 240, 3), dtype=np.uint8)
        cv2.circle(polar, (120, 120), 110, (40, 90, 180), -1)
        cv2.circle(polar, (120, 120), 28, (0, 0, 0), -1)
        self.assertTrue(is_polar_pipe_scan(polar))
        strip = np.full((80, 240, 3), 90, dtype=np.uint8)
        self.assertFalse(is_polar_pipe_scan(strip))
        gray = np.full((80, 160), 90, dtype=np.uint8)
        gray[20:28, 10:140] = 4
        score = shadow_penalty(gray, [10, 20, 140, 28])
        self.assertLess(score, 0.5)


if __name__ == "__main__":
    unittest.main()

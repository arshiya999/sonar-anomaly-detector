#!/usr/bin/env python3
import math
import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from geotag import destination, pixel_to_latlon


class GeoTagTests(unittest.TestCase):
    def test_north_1000m(self):
        lat, lon = destination(13.0, 80.0, 0.0, 1000.0)
        self.assertAlmostEqual(lat, 13.00899, places=4)
        self.assertAlmostEqual(lon, 80.0, places=4)

    def test_pixel_center_stays_near_origin(self):
        meta = {
            "latitude": 13.0827,
            "longitude": 80.3708,
            "heading_deg": 0,
            "meters_per_pixel_x": 0.1,
            "meters_per_pixel_y": 0.1,
        }
        lat, lon = pixel_to_latlon(500, 400, 1000, 800, meta)
        self.assertIsNotNone(lat)
        assert lat is not None and lon is not None
        self.assertLess(abs(lat - 13.0827), 0.0002)
        self.assertLess(abs(lon - 80.3708), 0.0002)

    def test_haversine_distance_sanity(self):
        lat2, lon2 = destination(0.0, 0.0, 90.0, 111319.5)
        self.assertTrue(math.isclose(lat2, 0.0, abs_tol=1e-3))
        self.assertGreater(lon2, 0.9)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "modeling"))

from forecast_studio import (  # noqa: E402
    FARE_CLASSES,
    HORIZONS,
    MODELS,
    ROUTES,
    ForecastConfig,
    generate_dataset,
    run_forecast,
)


class ForecastStudioTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.frame = generate_dataset()

    def test_focused_shape_and_reproducibility(self) -> None:
        frame = self.frame
        self.assertEqual(len(frame), 4_932)
        self.assertEqual(frame.loc[frame.is_history, "departure_date"].nunique(), 730)
        self.assertEqual(frame.loc[~frame.is_history, "departure_date"].nunique(), 92)
        self.assertEqual(set(frame.route), set(ROUTES))
        self.assertEqual(set(frame.fare_class), set(FARE_CLASSES))
        second = generate_dataset()
        pd.testing.assert_frame_equal(frame.head(60), second.head(60))

    def test_curves_are_logical(self) -> None:
        for row in self.frame.itertuples(index=False):
            bookings = [getattr(row, f"bookings_d{h}") for h in HORIZONS]
            revenue = [getattr(row, f"revenue_d{h}") for h in HORIZONS]
            self.assertEqual(bookings[-1], row.final_bookings)
            self.assertAlmostEqual(revenue[-1], row.final_revenue, places=2)
            self.assertTrue(all(right >= left for left, right in zip(bookings, bookings[1:])))
            self.assertTrue(all(right >= left for left, right in zip(revenue, revenue[1:])))

    def test_models_run_and_do_not_predict_below_on_hand(self) -> None:
        result = run_forecast(
            self.frame,
            ForecastConfig(
                route="Montréal–Toronto",
                target="bookings",
                segment="All classes",
                aggregation="weekly",
            ),
        )
        self.assertEqual(set(result["metrics"]["key"]), set(MODELS))
        self.assertEqual(len(result["daily"]), 92)
        self.assertFalse(result["metrics"]["wape"].isna().any())
        for key in MODELS:
            self.assertTrue(
                np.all(result["daily"][key] >= result["daily"]["observed"] - 1e-7)
            )

    def test_hidden_final_target_is_not_a_prediction_feature(self) -> None:
        config = ForecastConfig(
            route="Montréal–Toronto",
            target="bookings",
            segment="All classes",
            aggregation="weekly",
        )
        first = run_forecast(self.frame, config)
        changed = self.frame.copy()
        changed["final_bookings"] = changed["final_bookings"].astype(float)
        changed.loc[~changed.is_history, "final_bookings"] *= 1.35
        second = run_forecast(changed, config)
        for key in MODELS:
            np.testing.assert_allclose(first["daily"][key], second["daily"][key])

    def test_aggregations_preserve_totals(self) -> None:
        totals: dict[str, float] = {}
        forecast_totals: dict[str, float] = {}
        for aggregation in ["daily", "weekly", "monthly"]:
            result = run_forecast(
                self.frame,
                ForecastConfig(
                    route="Montréal–Ottawa",
                    target="revenue",
                    segment="Business",
                    aggregation=aggregation,
                ),
            )
            totals[aggregation] = result["forecasts"]["actual"].sum()
            forecast_totals[aggregation] = result["forecasts"]["hybrid"].sum()
        self.assertAlmostEqual(totals["daily"], totals["weekly"], places=5)
        self.assertAlmostEqual(totals["daily"], totals["monthly"], places=5)
        self.assertAlmostEqual(
            forecast_totals["daily"], forecast_totals["weekly"], places=5
        )
        self.assertAlmostEqual(
            forecast_totals["daily"], forecast_totals["monthly"], places=5
        )


if __name__ == "__main__":
    unittest.main()

import assert from "node:assert/strict";
import test from "node:test";

import {
  FARE_CLASSES,
  generateSyntheticDataset,
  HORIZONS,
  MODEL_KEYS,
  ROUTE_SPECS,
  runForecastStudio,
} from "../app/forecast-studio-engine.ts";

test("synthetic generator is reproducible and respects the focused scope", () => {
  const first = generateSyntheticDataset(20260728);
  const second = generateSyntheticDataset(20260728);

  assert.equal(first.meta.routeCount, 2);
  assert.equal(first.meta.classCount, 3);
  assert.equal(first.meta.historyDays, 730);
  assert.equal(first.meta.forecastDays, 92);
  assert.equal(first.records.length, 4_932);
  assert.deepEqual(
    [...new Set(first.records.map((row) => row.route))],
    ROUTE_SPECS.map((route) => route.name),
  );
  assert.deepEqual(
    [...new Set(first.records.map((row) => row.fareClass))],
    FARE_CLASSES,
  );
  assert.deepEqual(first.records.slice(0, 20), second.records.slice(0, 20));
});

test("booking and revenue curves are monotone and finish at the final value", () => {
  const data = generateSyntheticDataset();
  for (const row of data.records) {
    assert.equal(row.bookingCurve.length, HORIZONS.length);
    assert.equal(row.revenueCurve.length, HORIZONS.length);
    assert.equal(row.bookingCurve.at(-1), row.bookings);
    assert.equal(row.revenueCurve.at(-1), row.revenue);
    for (let index = 1; index < HORIZONS.length; index += 1) {
      assert.ok(row.bookingCurve[index] >= row.bookingCurve[index - 1]);
      assert.ok(row.revenueCurve[index] >= row.revenueCurve[index - 1]);
    }
  }
});

test("live forecast runs seven methods without future-target leakage", () => {
  const data = generateSyntheticDataset();
  const config = {
    route: ROUTE_SPECS[0].name,
    target: "bookings",
    segment: "All classes",
    aggregation: "weekly",
  };
  const first = runForecastStudio(data, config);
  assert.equal(first.metrics.length, MODEL_KEYS.length);
  assert.equal(first.daily.length, 92);
  assert.ok(first.metrics.every((row) => Number.isFinite(row.wape)));
  for (const point of first.daily) {
    for (const model of MODEL_KEYS) {
      assert.ok(point.predictions[model] >= point.observed - 1e-7);
    }
  }

  const changedTruth = structuredClone(data);
  for (const row of changedTruth.records) {
    if (row.date >= changedTruth.meta.forecastStart) {
      row.bookings *= 1.35;
    }
  }
  const second = runForecastStudio(changedTruth, config);
  for (let index = 0; index < first.daily.length; index += 1) {
    for (const model of MODEL_KEYS) {
      assert.equal(
        first.daily[index].predictions[model],
        second.daily[index].predictions[model],
      );
    }
  }
});

test("daily, weekly, and monthly views preserve the same forecast totals", () => {
  const data = generateSyntheticDataset();
  const run = runForecastStudio(data, {
    route: ROUTE_SPECS[1].name,
    target: "revenue",
    segment: "Business",
    aggregation: "daily",
  });
  const actualDaily = run.daily.reduce((sum, row) => sum + row.actual, 0);

  for (const aggregation of ["daily", "weekly", "monthly"]) {
    const configRun = runForecastStudio(data, {
      route: ROUTE_SPECS[1].name,
      target: "revenue",
      segment: "Business",
      aggregation,
    });
    const actual = configRun.points.reduce((sum, point) => sum + point.actual, 0);
    assert.ok(Math.abs(actual - actualDaily) < 1e-5);
    for (const model of MODEL_KEYS) {
      const fromPoints = configRun.points.reduce(
        (sum, point) => sum + point.predictions[model],
        0,
      );
      const fromDaily = configRun.daily.reduce(
        (sum, point) => sum + point.predictions[model],
        0,
      );
      assert.ok(Math.abs(fromPoints - fromDaily) < 1e-5);
    }
  }
});

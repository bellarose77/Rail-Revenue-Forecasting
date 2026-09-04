"""Focused two-route rail bookings and revenue forecasting studio.

The module intentionally stays compact. It creates two years of deterministic
synthetic history plus a three-month hidden validation block, then compares
simple statistical, time-series, booking-curve, linear ML, boosted-tree,
ensemble, and lead-time-aware hybrid approaches.

No sell-out or customer buy-up probabilities are calculated.
"""

from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter
from typing import Callable

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


DEFAULT_SEED = 20260728
HISTORY_START = pd.Timestamp("2024-08-01")
HISTORY_END = pd.Timestamp("2026-07-31")
FORECAST_START = pd.Timestamp("2026-08-01")
FORECAST_END = pd.Timestamp("2026-10-31")
HORIZONS = [90, 60, 30, 14, 7, 0]
FARE_CLASSES = ["Economy", "Premium", "Business"]
BASE_MODELS = ["seasonal", "time_series", "booking_curve", "ridge", "boosted"]
MODELS = BASE_MODELS + ["ensemble", "hybrid"]
MODEL_LABELS = {
    "seasonal": "Seasonal historical median",
    "time_series": "Exponential smoothing and trend",
    "booking_curve": "Booking-curve completion",
    "ridge": "Regularized linear regression",
    "boosted": "Gradient-boosted trees (XGBoost-style)",
    "ensemble": "Validation-weighted ensemble",
    "hybrid": "Lead-time-aware hybrid",
}
MODEL_FAMILIES = {
    "seasonal": "Simple statistical",
    "time_series": "Time series",
    "booking_curve": "Rail statistical",
    "ridge": "Interpretable ML",
    "boosted": "Non-linear ML",
    "ensemble": "Combined",
    "hybrid": "Adaptive combined",
}

ROUTES = {
    "Montréal–Toronto": {
        "code": "MTL–TOR",
        "base": 365,
        "capacity": 520,
        "economy_fare": 96,
        "shares": {"Economy": 0.50, "Premium": 0.29, "Business": 0.21},
        "dow": [1.03, 1.02, 1.05, 1.08, 1.15, 0.88, 1.08],
    },
    "Montréal–Ottawa": {
        "code": "MTL–OTT",
        "base": 278,
        "capacity": 400,
        "economy_fare": 68,
        "shares": {"Economy": 0.55, "Premium": 0.28, "Business": 0.17},
        "dow": [0.98, 1.10, 1.12, 1.09, 1.01, 0.78, 0.86],
    },
}

CLASS_SPECS = {
    "Economy": {
        "fare": 1.0,
        "completion": [0.05, 0.18, 0.44, 0.67, 0.83, 1.0],
        "stage_fare": [0.84, 0.88, 0.95, 1.03, 1.12, 1.20],
        "dow": [0.98, 0.98, 0.99, 1.00, 1.06, 1.16, 1.13],
    },
    "Premium": {
        "fare": 1.55,
        "completion": [0.025, 0.11, 0.32, 0.54, 0.73, 1.0],
        "stage_fare": [0.92, 0.95, 1.00, 1.06, 1.11, 1.16],
        "dow": [1.00, 1.03, 1.04, 1.04, 1.05, 0.94, 0.96],
    },
    "Business": {
        "fare": 2.38,
        "completion": [0.008, 0.045, 0.16, 0.36, 0.57, 1.0],
        "stage_fare": [1.01, 1.03, 1.05, 1.08, 1.11, 1.14],
        "dow": [1.02, 1.20, 1.24, 1.20, 1.08, 0.52, 0.58],
    },
}

MONTH_FACTOR = {
    1: 0.83,
    2: 0.87,
    3: 0.94,
    4: 0.98,
    5: 1.03,
    6: 1.09,
    7: 1.15,
    8: 1.13,
    9: 1.07,
    10: 1.01,
    11: 0.94,
    12: 1.10,
}


@dataclass(frozen=True)
class ForecastConfig:
    route: str
    target: str = "bookings"
    segment: str = "All classes"
    aggregation: str = "weekly"


def _holiday(day: pd.Timestamp) -> bool:
    return bool(
        (day.month == 12 and day.day >= 20)
        or (day.month == 1 and day.day <= 5)
        or (day.month == 7 and day.day <= 4)
        or (day.month == 10 and 8 <= day.day <= 14)
        or (day.month == 3 and 1 <= day.day <= 9)
    )


def generate_dataset(seed: int = DEFAULT_SEED) -> pd.DataFrame:
    """Create realistic, reproducible route × date × fare-class records."""
    rng = np.random.default_rng(seed)
    rows: list[dict] = []
    dates = pd.date_range(HISTORY_START, FORECAST_END, freq="D")

    for day_index, day in enumerate(dates):
        dow = day.dayofweek
        holiday = _holiday(day)
        years = (day - HISTORY_START).days / 365.25
        for route_index, (route_name, route) in enumerate(ROUTES.items()):
            event = bool(
                (day_index + route_index * 31) % 97 <= 2
                or (
                    day.month == 9
                    and 12 + route_index * 5
                    <= day.day
                    <= 14 + route_index * 5
                )
            )
            promotion = bool(
                (day_index // 7 + route_index * 3) % 11 == 0
                and dow in {1, 2, 3}
            )
            route_noise = rng.normal(0, 0.035)
            trend = 1 + 0.026 * years
            regime = (
                1.035
                if day >= pd.Timestamp("2026-01-15") and route_index == 0
                else 1.02
                if day >= pd.Timestamp("2026-01-15")
                else 1.0
            )
            raw = []
            for fare_class in FARE_CLASSES:
                spec = CLASS_SPECS[fare_class]
                holiday_factor = (
                    1.18
                    if fare_class == "Economy"
                    else 0.78
                    if fare_class == "Business"
                    else 1.06
                )
                event_factor = (
                    1.10
                    if fare_class == "Business"
                    else 1.15
                    if fare_class == "Premium"
                    else 1.20
                )
                promotion_factor = (
                    1.14 if promotion and fare_class == "Economy" else 1.0
                )
                class_regime = (
                    1.07
                    if day >= pd.Timestamp("2026-01-15")
                    and route_index == 0
                    and fare_class == "Business"
                    else 1.04
                    if day >= pd.Timestamp("2026-01-15")
                    and route_index == 1
                    and fare_class == "Economy"
                    else 1.0
                )
                mean = (
                    route["base"]
                    * route["shares"][fare_class]
                    * MONTH_FACTOR[day.month]
                    * route["dow"][dow]
                    * spec["dow"][dow]
                    * trend
                    * regime
                    * class_regime
                    * (holiday_factor if holiday else 1)
                    * (event_factor if event else 1)
                    * promotion_factor
                )
                value = (
                    mean * (1 + route_noise + rng.normal(0, 0.045))
                    + rng.normal(0, np.sqrt(mean) * 0.65)
                )
                raw.append(max(5, int(round(value))))

            raw_total = sum(raw)
            scale = min(1.0, route["capacity"] * 0.91 / max(raw_total, 1))
            for class_index, fare_class in enumerate(FARE_CLASSES):
                spec = CLASS_SPECS[fare_class]
                bookings = max(4, int(round(raw[class_index] * scale)))
                completion = []
                prior = 0.0
                for index, base in enumerate(spec["completion"]):
                    early_weight = 1 - index / (len(HORIZONS) - 1)
                    shift = (
                        (0.035 * early_weight if holiday and fare_class == "Economy" else 0)
                        + (0.015 * early_weight if event and fare_class != "Business" else 0)
                        - (
                            0.012 * early_weight
                            if dow in {0, 1, 2, 3}
                            and fare_class == "Business"
                            else 0
                        )
                    )
                    value = (
                        1.0
                        if index == len(HORIZONS) - 1
                        else np.clip(
                            base + shift + rng.normal(0, 0.007),
                            prior + 0.002,
                            0.97,
                        )
                    )
                    completion.append(float(value))
                    prior = float(value)

                booking_curve = []
                prior_bookings = 0
                for index, share in enumerate(completion):
                    cumulative = (
                        bookings
                        if index == len(HORIZONS) - 1
                        else max(prior_bookings, int(round(bookings * share)))
                    )
                    booking_curve.append(cumulative)
                    prior_bookings = cumulative

                base_fare = (
                    route["economy_fare"]
                    * spec["fare"]
                    * (1 + years * 0.018)
                    * (1 + rng.normal(0, 0.018))
                    * (0.92 if promotion and fare_class == "Economy" else 1)
                    * (1.025 if event else 1)
                )
                revenue_curve = []
                cumulative_revenue = 0.0
                previous = 0
                for index, cumulative in enumerate(booking_curve):
                    pickup = cumulative - previous
                    cumulative_revenue += (
                        pickup * base_fare * spec["stage_fare"][index]
                    )
                    revenue_curve.append(round(cumulative_revenue, 2))
                    previous = cumulative

                record = {
                    "departure_date": day,
                    "route": route_name,
                    "route_code": route["code"],
                    "fare_class": fare_class,
                    "capacity": route["capacity"],
                    "final_bookings": bookings,
                    "final_revenue": revenue_curve[-1],
                    "average_fare": revenue_curve[-1] / max(bookings, 1),
                    "holiday": holiday,
                    "event": event,
                    "promotion": promotion,
                    "is_history": day <= HISTORY_END,
                }
                for index, horizon in enumerate(HORIZONS):
                    record[f"bookings_d{horizon}"] = booking_curve[index]
                    record[f"revenue_d{horizon}"] = revenue_curve[index]
                rows.append(record)
    return pd.DataFrame(rows)


def dataset_summary(frame: pd.DataFrame) -> dict:
    history = frame.loc[frame["is_history"]]
    route_summary = (
        history.groupby("route", as_index=False)
        .agg(
            total_bookings=("final_bookings", "sum"),
            total_revenue=("final_revenue", "sum"),
            capacity=("capacity", "first"),
        )
    )
    history_days = history["departure_date"].nunique()
    route_summary["average_daily_bookings"] = (
        route_summary["total_bookings"] / history_days
    )
    route_summary["average_daily_revenue"] = (
        route_summary["total_revenue"] / history_days
    )
    class_summary = (
        history.groupby("fare_class", as_index=False)
        .agg(
            bookings=("final_bookings", "sum"),
            revenue=("final_revenue", "sum"),
        )
    )
    class_summary["booking_share"] = (
        class_summary["bookings"] / class_summary["bookings"].sum()
    )
    class_summary["revenue_share"] = (
        class_summary["revenue"] / class_summary["revenue"].sum()
    )
    class_summary["average_fare"] = (
        class_summary["revenue"] / class_summary["bookings"]
    )
    weekday = history.assign(
        weekday=history["departure_date"].dt.day_name().str[:3]
    )
    weekday = (
        weekday.groupby(["departure_date", "weekday"], as_index=False)
        .agg(bookings=("final_bookings", "sum"))
        .groupby("weekday", as_index=False)
        .agg(bookings=("bookings", "mean"))
    )
    curve_rows = []
    for fare_class, selected in history.groupby("fare_class"):
        for horizon in HORIZONS:
            curve_rows.append(
                {
                    "fare_class": fare_class,
                    "horizon": horizon,
                    "completion": np.median(
                        selected[f"bookings_d{horizon}"]
                        / selected["final_bookings"].clip(lower=1)
                    ),
                }
            )
    return {
        "routes": route_summary,
        "classes": class_summary,
        "weekday": weekday,
        "curves": pd.DataFrame(curve_rows),
    }


def _daily_series(frame: pd.DataFrame, config: ForecastConfig) -> pd.DataFrame:
    selected = frame.loc[frame["route"].eq(config.route)].copy()
    if config.segment != "All classes":
        selected = selected.loc[selected["fare_class"].eq(config.segment)]
    aggregations = {
        "capacity": ("capacity", "max"),
        "bookings": ("final_bookings", "sum"),
        "revenue": ("final_revenue", "sum"),
        "holiday": ("holiday", "max"),
        "event": ("event", "max"),
        "promotion": ("promotion", "max"),
        "is_history": ("is_history", "max"),
    }
    for horizon in HORIZONS:
        aggregations[f"bookings_d{horizon}"] = (f"bookings_d{horizon}", "sum")
        aggregations[f"revenue_d{horizon}"] = (f"revenue_d{horizon}", "sum")
    daily = (
        selected.groupby("departure_date", as_index=False)
        .agg(**aggregations)
        .sort_values("departure_date")
        .reset_index(drop=True)
    )
    daily["dow"] = daily["departure_date"].dt.dayofweek
    daily["month"] = daily["departure_date"].dt.month
    return daily


def _curve_at_lead(
    frame: pd.DataFrame, target: str, lead: int | np.ndarray
) -> np.ndarray:
    prefix = "bookings" if target == "bookings" else "revenue"
    leads = (
        np.full(len(frame), int(lead), dtype=int)
        if np.isscalar(lead)
        else np.asarray(lead, dtype=int)
    )
    result = np.zeros(len(frame), dtype=float)
    for row_index, current_lead in enumerate(leads):
        if current_lead >= HORIZONS[0]:
            result[row_index] = frame.iloc[row_index][f"{prefix}_d{HORIZONS[0]}"]
            continue
        if current_lead <= 0:
            result[row_index] = frame.iloc[row_index][f"{prefix}_d0"]
            continue
        for index in range(len(HORIZONS) - 1):
            farther, closer = HORIZONS[index], HORIZONS[index + 1]
            if closer <= current_lead <= farther:
                progress = (farther - current_lead) / (farther - closer)
                left = frame.iloc[row_index][f"{prefix}_d{farther}"]
                right = frame.iloc[row_index][f"{prefix}_d{closer}"]
                result[row_index] = left * (1 - progress) + right * progress
                break
    return result


def _actual(frame: pd.DataFrame, target: str) -> np.ndarray:
    column = "bookings" if target == "bookings" else "revenue"
    return frame[column].to_numpy(dtype=float)


def _seasonal_predictor(
    train: pd.DataFrame, target: str
) -> Callable[[pd.DataFrame], np.ndarray]:
    actual_column = "bookings" if target == "bookings" else "revenue"
    recent = train.tail(90)[actual_column]
    prior = train.iloc[-180:-90][actual_column]
    trend = (
        float(
            np.clip(
                np.median(recent) / max(float(np.median(prior)), 1),
                0.90,
                1.12,
            )
        )
        if len(prior) >= 45
        else 1.0
    )

    def predict(targets: pd.DataFrame) -> np.ndarray:
        values = []
        for row in targets.itertuples(index=False):
            peers = train.loc[train["dow"].eq(row.dow)].copy()
            month_distance = np.minimum(
                np.abs(peers["month"] - row.month),
                12 - np.abs(peers["month"] - row.month),
            )
            near = peers.loc[month_distance.le(1)]
            if len(near) < 10:
                near = peers
            values.append(float(np.median(near.tail(20)[actual_column])) * trend)
        return np.asarray(values)

    return predict


def _time_series_predictor(
    train: pd.DataFrame, target: str
) -> Callable[[pd.DataFrame], np.ndarray]:
    actual_column = "bookings" if target == "bookings" else "revenue"
    last_date = train["departure_date"].max()

    def predict(targets: pd.DataFrame) -> np.ndarray:
        values = []
        for row in targets.itertuples(index=False):
            peers = train.loc[train["dow"].eq(row.dow)].tail(16)
            history = peers[actual_column].to_numpy(dtype=float)
            if len(history) < 6:
                values.append(float(np.median(train.tail(42)[actual_column])))
                continue
            weights = np.power(0.84, np.arange(len(history) - 1, -1, -1))
            level = float(np.average(history, weights=weights))
            recent = float(np.median(history[-4:]))
            previous = float(np.median(history[-8:-4]))
            weekly_trend = float(
                np.clip(
                    (recent - previous) / 4,
                    -level * 0.018,
                    level * 0.018,
                )
            )
            weeks_ahead = max(
                0.0, (row.departure_date - last_date).days / 7
            )
            values.append(max(1.0, level + weekly_trend * weeks_ahead))
        return np.asarray(values)

    return predict


def _booking_curve_predictor(
    train: pd.DataFrame, target: str
) -> Callable[[pd.DataFrame, np.ndarray], np.ndarray]:
    actual = _actual(train, target)

    def predict(targets: pd.DataFrame, leads: np.ndarray) -> np.ndarray:
        result = []
        for row_index, row in enumerate(targets.itertuples(index=False)):
            lead = int(leads[row_index])
            observed = _curve_at_lead(targets.iloc[[row_index]], target, lead)[0]
            peers = train.loc[train["dow"].eq(row.dow)].copy()
            month_distance = np.minimum(
                np.abs(peers["month"] - row.month),
                12 - np.abs(peers["month"] - row.month),
            )
            peers = peers.loc[month_distance.le(1)]
            if len(peers) < 16:
                peers = train
            indices = peers.index.to_numpy()
            completion = np.median(
                _curve_at_lead(peers, target, lead)
                / np.maximum(actual[indices - train.index.min()], 1)
            )
            completion = float(np.clip(completion, 0.01, 1))
            result.append(max(observed, observed / completion))
        return np.asarray(result)

    return predict


def _feature_frame(
    frame: pd.DataFrame,
    leads: np.ndarray,
    target: str,
    origin: pd.Timestamp,
) -> pd.DataFrame:
    observed = _curve_at_lead(frame, target, leads)
    bookings_observed = _curve_at_lead(frame, "bookings", leads)
    revenue_observed = _curve_at_lead(frame, "revenue", leads)
    result = pd.DataFrame(index=range(len(frame)))
    result["observed"] = observed
    result["load_at_cutoff"] = bookings_observed / frame["capacity"].to_numpy()
    result["capacity"] = frame["capacity"].to_numpy()
    result["fare_at_cutoff"] = revenue_observed / np.maximum(bookings_observed, 1)
    result["lead_share"] = leads / 90
    result["holiday"] = frame["holiday"].astype(int).to_numpy()
    result["event"] = frame["event"].astype(int).to_numpy()
    result["promotion"] = frame["promotion"].astype(int).to_numpy()
    result["dow_sin"] = np.sin(2 * np.pi * frame["dow"].to_numpy() / 7)
    result["dow_cos"] = np.cos(2 * np.pi * frame["dow"].to_numpy() / 7)
    result["month_sin"] = np.sin(2 * np.pi * frame["month"].to_numpy() / 12)
    result["month_cos"] = np.cos(2 * np.pi * frame["month"].to_numpy() / 12)
    result["trend_years"] = (
        frame["departure_date"].to_numpy() - np.datetime64(origin)
    ) / np.timedelta64(1, "D") / 365.25
    return result


def _ml_predictions(
    train: pd.DataFrame,
    targets: pd.DataFrame,
    leads: np.ndarray,
    target: str,
) -> dict[str, np.ndarray]:
    expanded_features = []
    expanded_target = []
    actual = _actual(train, target)
    origin = train["departure_date"].min()
    for horizon in HORIZONS:
        horizon_leads = np.full(len(train), horizon)
        expanded_features.append(
            _feature_frame(train, horizon_leads, target, origin)
        )
        expanded_target.append(actual)
    train_features = pd.concat(expanded_features, ignore_index=True)
    train_target = np.concatenate(expanded_target)
    target_features = _feature_frame(targets, leads, target, origin)
    observed = _curve_at_lead(targets, target, leads)

    ridge = make_pipeline(StandardScaler(), Ridge(alpha=4.0))
    ridge.fit(train_features, train_target)
    ridge_prediction = np.maximum(observed, ridge.predict(target_features))

    boosted = HistGradientBoostingRegressor(
        learning_rate=0.07,
        max_iter=110,
        max_leaf_nodes=19,
        min_samples_leaf=28,
        l2_regularization=1.5,
        random_state=DEFAULT_SEED,
    )
    boosted.fit(train_features, train_target)
    boosted_prediction = np.maximum(
        observed, boosted.predict(target_features)
    )
    return {"ridge": ridge_prediction, "boosted": boosted_prediction}


def _base_predictions(
    train: pd.DataFrame,
    targets: pd.DataFrame,
    leads: np.ndarray,
    target: str,
) -> dict[str, np.ndarray]:
    observed = _curve_at_lead(targets, target, leads)
    seasonal = _seasonal_predictor(train, target)(targets)
    time_series = _time_series_predictor(train, target)(targets)
    booking_curve = _booking_curve_predictor(train, target)(targets, leads)
    ml = _ml_predictions(train, targets, leads, target)
    return {
        "seasonal": np.maximum(observed, seasonal),
        "time_series": np.maximum(observed, time_series),
        "booking_curve": np.maximum(observed, booking_curve),
        "ridge": ml["ridge"],
        "boosted": ml["boosted"],
    }


def _wape(actual: np.ndarray, predicted: np.ndarray) -> float:
    return float(
        np.abs(predicted - actual).sum()
        / max(float(np.abs(actual).sum()), 1)
        * 100
    )


def _normalize(values: dict[str, float]) -> dict[str, float]:
    total = sum(values.values()) or 1
    return {key: value / total for key, value in values.items()}


def _horizon_priors(lead: int) -> dict[str, float]:
    if lead >= 60:
        values = [0.30, 0.34, 0.09, 0.17, 0.10]
    elif lead >= 30:
        values = [0.20, 0.23, 0.19, 0.18, 0.20]
    elif lead >= 14:
        values = [0.12, 0.13, 0.28, 0.19, 0.28]
    else:
        values = [0.06, 0.07, 0.40, 0.14, 0.33]
    return dict(zip(BASE_MODELS, values, strict=True))


def _fixed_combine(
    predictions: dict[str, np.ndarray], weights: dict[str, float]
) -> np.ndarray:
    return sum(predictions[key] * weights[key] for key in BASE_MODELS)


def _adaptive_combine(
    predictions: dict[str, np.ndarray],
    leads: np.ndarray,
    calibration_wape: dict[str, float],
) -> tuple[np.ndarray, dict[str, float]]:
    totals = {key: 0.0 for key in BASE_MODELS}
    values = []
    for row_index, lead in enumerate(leads):
        priors = _horizon_priors(int(lead))
        weights = _normalize(
            {
                key: priors[key] / max(calibration_wape[key], 2)
                for key in BASE_MODELS
            }
        )
        values.append(
            sum(
                predictions[key][row_index] * weights[key]
                for key in BASE_MODELS
            )
        )
        for key in BASE_MODELS:
            totals[key] += weights[key]
    return np.asarray(values), {
        key: value / len(leads) for key, value in totals.items()
    }


def _aggregate(
    frame: pd.DataFrame,
    leads: np.ndarray,
    predictions: dict[str, np.ndarray],
    target: str,
    aggregation: str,
) -> pd.DataFrame:
    result = pd.DataFrame(
        {
            "departure_date": frame["departure_date"].to_numpy(),
            "actual": _actual(frame, target),
            "observed": _curve_at_lead(frame, target, leads),
        }
    )
    for key in MODELS:
        result[key] = predictions[key]
    if aggregation == "daily":
        result["period"] = result["departure_date"].dt.strftime("%Y-%m-%d")
    elif aggregation == "weekly":
        result["period_start"] = (
            result["departure_date"]
            - pd.to_timedelta(result["departure_date"].dt.dayofweek, unit="D")
        )
        result["period"] = result["period_start"].dt.strftime("%Y-%m-%d")
    else:
        result["period"] = result["departure_date"].dt.strftime("%Y-%m")
    grouped = (
        result.groupby("period", as_index=False)[
            ["actual", "observed", *MODELS]
        ]
        .sum()
    )
    return grouped


def _score(
    calibration: pd.DataFrame,
    calibration_leads: np.ndarray,
    calibration_predictions: dict[str, np.ndarray],
    validation: pd.DataFrame,
    validation_leads: np.ndarray,
    validation_predictions: dict[str, np.ndarray],
    target: str,
    aggregation: str,
    calibration_wape: dict[str, float],
    ensemble_weights: dict[str, float],
) -> tuple[pd.DataFrame, pd.DataFrame]:
    calibration_groups = _aggregate(
        calibration,
        calibration_leads,
        calibration_predictions,
        target,
        aggregation,
    )
    groups = _aggregate(
        validation,
        validation_leads,
        validation_predictions,
        target,
        aggregation,
    )
    minimum_width = 3 if target == "bookings" else 250
    metrics = []
    actual = groups["actual"].to_numpy()
    denominator = max(float(np.abs(actual).sum()), 1)
    for key in MODELS:
        calibration_error = np.abs(
            calibration_groups["actual"] - calibration_groups[key]
        )
        width = max(
            minimum_width, float(np.quantile(calibration_error, 0.90))
        )
        groups[f"{key}_lower"] = np.maximum(
            groups["observed"], groups[key] - width
        )
        groups[f"{key}_upper"] = groups[key] + width
        predicted = groups[key].to_numpy()
        error = predicted - actual
        coverage = np.mean(
            (actual >= groups[f"{key}_lower"])
            & (actual <= groups[f"{key}_upper"])
        )
        metrics.append(
            {
                "key": key,
                "approach": MODEL_LABELS[key],
                "family": MODEL_FAMILIES[key],
                "wape": _wape(actual, predicted),
                "mae": float(np.abs(error).mean()),
                "bias": float(error.sum() / denominator * 100),
                "coverage_90": float(coverage * 100),
                "calibration_wape": (
                    calibration_wape[key]
                    if key in calibration_wape
                    else _wape(
                        calibration_groups["actual"].to_numpy(),
                        calibration_groups[key].to_numpy(),
                    )
                ),
                "weight": ensemble_weights.get(key, 1.0),
            }
        )
    return (
        pd.DataFrame(metrics).sort_values("wape").reset_index(drop=True),
        groups,
    )


def run_forecast(frame: pd.DataFrame, config: ForecastConfig) -> dict:
    """Fit all approaches, forecast the hidden three months, and score them."""
    started = perf_counter()
    series = _daily_series(frame, config)
    history = series.loc[series["is_history"]].reset_index(drop=True)
    validation = series.loc[~series["is_history"]].reset_index(drop=True)
    calibration_days = len(validation)
    fit = history.iloc[:-calibration_days].reset_index(drop=True)
    calibration = history.iloc[-calibration_days:].reset_index(drop=True)
    calibration_leads = np.arange(1, len(calibration) + 1)
    validation_leads = np.arange(1, len(validation) + 1)

    calibration_base = _base_predictions(
        fit, calibration, calibration_leads, config.target
    )
    calibration_actual = _actual(calibration, config.target)
    calibration_wape = {
        key: _wape(calibration_actual, calibration_base[key])
        for key in BASE_MODELS
    }
    ensemble_weights = _normalize(
        {
            key: 1 / max(calibration_wape[key], 1.5) ** 1.55
            for key in BASE_MODELS
        }
    )
    calibration_hybrid, _ = _adaptive_combine(
        calibration_base, calibration_leads, calibration_wape
    )
    calibration_predictions = {
        **calibration_base,
        "ensemble": _fixed_combine(calibration_base, ensemble_weights),
        "hybrid": calibration_hybrid,
    }

    validation_base = _base_predictions(
        history, validation, validation_leads, config.target
    )
    validation_hybrid, hybrid_weights = _adaptive_combine(
        validation_base, validation_leads, calibration_wape
    )
    validation_predictions = {
        **validation_base,
        "ensemble": _fixed_combine(validation_base, ensemble_weights),
        "hybrid": validation_hybrid,
    }

    metrics_by_aggregation = {}
    forecasts_by_aggregation = {}
    for aggregation in ["daily", "weekly", "monthly"]:
        metrics, forecasts = _score(
            calibration,
            calibration_leads,
            calibration_predictions,
            validation,
            validation_leads,
            validation_predictions,
            config.target,
            aggregation,
            calibration_wape,
            ensemble_weights,
        )
        metrics_by_aggregation[aggregation] = metrics
        forecasts_by_aggregation[aggregation] = forecasts

    daily = pd.DataFrame(
        {
            "departure_date": validation["departure_date"],
            "actual": _actual(validation, config.target),
            "observed": _curve_at_lead(
                validation, config.target, validation_leads
            ),
            "lead": validation_leads,
        }
    )
    for key in MODELS:
        daily[key] = validation_predictions[key]
    metrics = metrics_by_aggregation[config.aggregation]
    return {
        "config": config,
        "runtime_ms": (perf_counter() - started) * 1000,
        "metrics": metrics,
        "metrics_by_aggregation": metrics_by_aggregation,
        "forecasts": forecasts_by_aggregation[config.aggregation],
        "forecasts_by_aggregation": forecasts_by_aggregation,
        "daily": daily,
        "best_model": str(metrics.iloc[0]["key"]),
        "ensemble_weights": ensemble_weights,
        "hybrid_weights": hybrid_weights,
        "train_start": history["departure_date"].min(),
        "train_end": history["departure_date"].max(),
        "calibration_start": calibration["departure_date"].min(),
        "forecast_start": validation["departure_date"].min(),
        "forecast_end": validation["departure_date"].max(),
    }


def booking_curve_view(
    frame: pd.DataFrame,
    result: dict,
    target_date: str | pd.Timestamp,
    model: str,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    config: ForecastConfig = result["config"]
    series = _daily_series(frame, config)
    history = series.loc[series["is_history"]].copy()
    target_date = pd.Timestamp(target_date)
    target = series.loc[series["departure_date"].eq(target_date)].iloc[[0]]
    output = result["daily"].loc[
        result["daily"]["departure_date"].eq(target_date)
    ].iloc[0]
    lead = int(output["lead"])
    observed = _curve_at_lead(target, config.target, lead)[0]
    candidates = history.copy()
    candidates["score"] = (
        np.abs(_curve_at_lead(candidates, config.target, lead) - observed)
        / max(observed, 1)
        + np.where(
            candidates["dow"].eq(int(target.iloc[0]["dow"])), 0, 0.30
        )
        + np.where(
            candidates["event"].eq(bool(target.iloc[0]["event"])), 0, 0.12
        )
    )
    peers = candidates.nsmallest(16, "score")
    horizons = sorted(set(HORIZONS + [lead]), reverse=True)
    records = []
    prior_projection = 0.0
    for horizon in horizons:
        peer_values = _curve_at_lead(peers, config.target, horizon)
        peer_actual = _actual(peers, config.target)
        completion = float(
            np.clip(np.median(peer_values / np.maximum(peer_actual, 1)), 0.005, 1)
        )
        known = horizon >= lead
        target_value = _curve_at_lead(target, config.target, horizon)[0]
        projected = (
            target_value
            if known
            else max(observed, float(output[model]) * completion)
        )
        prior_projection = max(prior_projection, projected)
        records.append(
            {
                "horizon": horizon,
                "Historical median": float(np.median(peer_values)),
                "Observed at cutoff": target_value if known else np.nan,
                "Projected curve": prior_projection,
                "Validation reality": target_value,
            }
        )
    curve = pd.DataFrame(records)
    cutoff = int(curve.index[curve["horizon"].eq(lead)][0])
    pickup_rows = []
    for index in range(cutoff, len(curve) - 1):
        current = curve.iloc[index]
        following = curve.iloc[index + 1]
        pickup_rows.append(
            {
                "lead_time_range": (
                    f"D-{int(current.horizon)} to departure"
                    if int(following.horizon) == 0
                    else f"D-{int(current.horizon)} to D-{int(following.horizon)}"
                ),
                "forecast_pickup": max(
                    0, following["Projected curve"] - current["Projected curve"]
                ),
                "actual_pickup": max(
                    0,
                    following["Validation reality"]
                    - current["Validation reality"],
                ),
            }
        )
    return curve, pd.DataFrame(pickup_rows)


def class_composition(
    frame: pd.DataFrame, config: ForecastConfig, model: str
) -> pd.DataFrame:
    rows = []
    for fare_class in FARE_CLASSES:
        result = run_forecast(
            frame,
            ForecastConfig(
                route=config.route,
                target=config.target,
                segment=fare_class,
                aggregation="monthly",
            ),
        )
        rows.append(
            {
                "fare_class": fare_class,
                "forecast": result["daily"][model].sum(),
                "actual": result["daily"]["actual"].sum(),
            }
        )
    result = pd.DataFrame(rows)
    result["forecast_share"] = result["forecast"] / result["forecast"].sum()
    result["actual_share"] = result["actual"] / result["actual"].sum()
    return result

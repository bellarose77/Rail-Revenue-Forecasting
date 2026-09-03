# Focused Rail Forecast Studio — Scope Revision

## Purpose

This version is a candidate skill demonstration. It
shows how the candidate structures and validates a practical rail bookings and
revenue forecast without turning the exercise into a production platform.

## Scope

- Two routes only: Montréal–Toronto and Montréal–Ottawa.
- Two years of historical data: August 1, 2024 through July 31, 2026.
- One future validation block: August 1 through October 31, 2026.
- Forecasts at daily, weekly, and monthly levels.
- Forecast targets: final bookings and final revenue.
- Total-train and class-level forecasts for Economy, Premium, and Business.
- Booking/revenue pickup expected in future lead-time ranges for a selected
  departure.
- No buy-up or sell-out probability modeling.

## Synthetic data logic

The data is generated from a fixed structure plus reproducible residual
variation. It deliberately includes:

- different base volumes and fares by route;
- route-specific weekday patterns;
- annual seasonality and a restrained underlying trend;
- deterministic holiday, event, and promotion effects;
- different Economy, Premium, and Business booking curves;
- fares that increase as departure approaches;
- a modest 2026 behavior shift so models must handle recent change.

Changing the seed changes only the residual variation. It does not remove the
business logic or turn the data into unstructured random values.

## Forecast approaches

1. Seasonal historical median — a transparent reference.
2. Exponential smoothing and trend — recent level and damped trend.
3. Booking-curve completion — observed pace divided by historical completion.
4. Regularized linear regression — interpretable multivariate ML.
5. Gradient-boosted trees (XGBoost-style) — compact non-linear ML.
6. Validation-weighted ensemble — weights learned on earlier calibration data.
7. Lead-time-aware hybrid — changes the blend as more booking information
   becomes available.

## Validation

The final three months are excluded from fitting. An earlier historical block
is used to calibrate combined-model weights and 90% residual intervals. Only
after all predictions exist is the synthetic final outcome revealed.

The app reports:

- WAPE;
- MAE;
- signed bias;
- 90% interval coverage;
- daily, weekly, and monthly comparison matrices;
- forecast-versus-reality charts;
- booking-curve and future-pickup validation for a selected departure.

## Useful ideas retained from the comparison apps

- deterministic route and fare-class behavior;
- class-specific booking curves;
- strict forward validation;
- baseline-versus-ML discipline;
- shared results in React and Streamlit;
- clear synthetic-data limitations.

The comparison apps' six-market scale, unconstraining workflow, sell-out
classifier, and buy-up discussion were intentionally excluded because they do
not support the revised focused objective.

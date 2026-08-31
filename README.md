# ExPretio rail bookings and revenue forecast lab

A compact candidate skill demonstration prepared for ExPretio Technologies.
The project generates realistic synthetic rail data, runs forecasting methods
live, and validates bookings and revenue forecasts at daily, weekly, and
monthly levels.

This is deliberately smaller than a production rail revenue-management system:

- exactly two routes: Montréal–Toronto and Montréal–Ottawa;
- exactly two years of historical data;
- one hidden three-month validation block: August–October 2026;
- final bookings and revenue for the full train;
- expected pickup by lead-time range for the same departure;
- class-level composition for Economy, Premium, and Business;
- no customer buy-up or sell-out probability modeling.

## Quick start

```powershell
npm install
npm run dev
```

You can also clone the project and double-click `START_STREAMLIT_WINDOWS.cmd`
to have the application open in your browser.

## Forecast approaches

1. Seasonal historical median
2. Exponential smoothing and trend
3. Booking-curve completion
4. Regularized linear regression
5. Gradient-boosted trees (XGBoost-style)
6. Validation-weighted ensemble
7. Lead-time-aware hybrid

The React version runs a compact boosted-tree implementation directly in the
browser. The Streamlit version uses scikit-learn histogram gradient boosting.
Both are called XGBoost-style to describe the model family without claiming
that the browser executes the XGBoost package.

## What is live

The **Generate & inspect data** tab creates the structured dataset from a
reproducible seed and explains its route, calendar, class, fare, and
booking-curve distributions.

The **Run one approach** tab fits the methods on demand, shows the execution
stages, creates the next-three-month forecast, then reveals the hidden
synthetic outcome for WAPE, MAE, bias, and interval-coverage validation.

The **Compare all approaches** tab runs all seven methods on the same split and
compares them visually and in exact tables, including a daily/weekly/monthly
performance matrix.

## Run React on Windows

Use Node.js 22.13 or newer:

```powershell
npm install
npm run dev
```

The command is cross-platform. `cross-env` handles the environment variable
syntax that caused the earlier Windows startup error.

## Run Streamlit

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r streamlit_app\requirements.txt
py -m streamlit run streamlit_app\app.py
```

## Regenerate the default CSV

```powershell
py modeling\generate_forecast_studio.py
```

The compressed output is written to `data/rail_forecast_studio.csv.gz`.

## Main project files

```text
app/forecast-studio.tsx          React interface
app/forecast-studio-engine.ts    Browser generator and seven-method forecast engine
modeling/forecast_studio.py      Python generator and forecast engine
streamlit_app/app.py             Streamlit interface
tests/                           Leakage, aggregation, model, render, and archive checks
```

All routes, dates, events, prices, bookings, revenue, and outcomes are
synthetic. Results demonstrate the workflow and the candidate's reasoning;
they are not claims about expected performance on ExPretio or operator data.

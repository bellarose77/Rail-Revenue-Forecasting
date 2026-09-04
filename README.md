# Rail bookings and revenue forecast lab

A compact candidate skill demonstration.
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

## Architecture

The forecasting logic exists twice, deliberately, as two independent
implementations of the same specification (see `docs/`):

- `src/forecast_studio.py` — Python engine (NumPy/pandas/scikit-learn),
  consumed by the Streamlit dashboard and by the test suite.
- `src/forecast-studio-engine.ts` — TypeScript engine, runs entirely in the
  browser and is consumed by the React/Next.js dashboard.

Everything else is presentation or infrastructure around those two engines:
a Streamlit UI, a React UI, and a Next.js/Cloudflare Worker app shell that
serves the React UI (with an unused D1 database binding scaffolded for
future use).

## Folder structure

```text
rail-revenue-forecasting/
├── .venv/               Local Python virtual environment (not committed)
├── analysis/            Reserved for exploratory/evaluation notebooks and scripts
├── app/                 Next.js App Router shell (layout, page, route-level code)
├── dashboard/
│   ├── react/            React dashboard UI (forecast-studio.tsx)
│   └── streamlit/         Streamlit dashboard UI (app.py, requirements.txt)
├── data/
│   ├── raw/              Lifecycle stage: as-received data (empty; no external source)
│   ├── interim/          Lifecycle stage: partially transformed data (empty; unused)
│   └── processed/         Lifecycle stage: analysis-ready data (rail_forecast_studio.csv.gz)
├── docs/                 Project scope and architecture notes
├── models/               Reserved for serialized trained model artifacts (empty by design)
├── reports/
│   ├── figures/           Reserved for exported charts/images
│   └── validation/        Reserved for exported WAPE/MAE/bias/coverage tables
├── scripts/              CLI/data/CI scripts (generate_dataset.py, Sites build plumbing)
├── server/
│   ├── db/                Drizzle ORM schema and D1 accessor
│   ├── drizzle/           Drizzle-kit migration output
│   └── worker/            Cloudflare Worker entry point
├── src/
│   ├── forecast_studio.py          Python forecasting engine
│   ├── forecast-studio-engine.ts   TypeScript forecasting engine
│   ├── config.py                   Central filesystem-path configuration
│   └── analysis/ data/ features/ metrics/ models/ pipelines/
│       Reserved subpackages for a future split of forecast_studio.py
├── tests/                Python (unittest) and Node (node:test) test suites
├── tools/                Reserved for developer/repo maintenance tooling
├── .gitignore
├── build.bat             Windows build/setup entry point
├── package.json
├── README.md
└── start.bat             Windows start entry point
```

A few directories exist at the repository root only because the frameworks
require it and moving them would break the app:

- `app/` — Next.js App Router requires this directory (or `src/app/`) at a
  fixed location. It holds only router-bound code (`layout.tsx`, `page.tsx`,
  `globals.css`, and a ChatGPT-auth helper that reads request headers); the
  actual dashboard UI and forecasting engine live under `dashboard/` and
  `src/` and are imported from here.
- `public/` — Next.js static asset convention.
- `node_modules/` — never committed (see `.gitignore`).
- `.openai/`, `build/`, `.sites-runtime/`, `.vinext/`, `.wrangler/` — scaffold
  and cache directories injected by the external "Sites" hosting platform
  that this template was generated from (`vite.config.ts` imports
  `build/sites-vite-plugin` and `.openai/hosting.json` by root-relative
  path). They are untracked and gitignored; do not move or commit them.

## Python requirements

- Python 3.11+ (developed and tested on 3.13)
- Packages: `dashboard/streamlit/requirements.txt`
  (`streamlit`, `pandas`, `numpy`, `scikit-learn`, `plotly`)
- The test suite (`tests/test_forecast_studio.py`) uses the standard-library
  `unittest` module — no extra test dependency is required, though `pytest`
  can also discover and run it if you prefer.

## Node.js requirements

- Node.js 22.13 or newer (see `package.json` → `engines`)
- All JavaScript/TypeScript dependencies are declared in `package.json` and
  locked in `package-lock.json`.

## Installation

```powershell
npm install
```

Python environment (for the Streamlit dashboard and Python tests):

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r dashboard\streamlit\requirements.txt
```

`build.bat` performs both of these steps for you (see below).

## Environment configuration

The Cloudflare Worker/D1 bindings are configured via `.openai/hosting.json`,
which is environment-specific, untracked, and provided by the hosting
platform rather than committed to source control. There is currently no
`.env` file required to run the React or Streamlit apps locally — both
generate their data live from a fixed seed and have no external service
dependencies. If a `.env.example` is ever added for local secrets, keep it
committed (`.gitignore` explicitly un-ignores `.env.example` while still
ignoring real `.env*` files).

## Database setup

`server/db/schema.ts` is intentionally empty — the demo does not currently
use the database. The Cloudflare D1 binding (`server/db/index.ts`) and
Drizzle configuration are scaffolded for future use.

## Drizzle migrations

```powershell
npm run db:generate
```

This runs `drizzle-kit generate` against `server/db/schema.ts` and writes
migration output to `server/drizzle/` (both paths configured in
`drizzle.config.ts`). There are no migrations yet since the schema is empty.

## How to start the project

Double-click `start.bat`, or run it from a terminal, and choose:

1. the React/Next.js app,
2. the Streamlit dashboard, or
3. both (Streamlit in the current window, React in a new one).

Once the server responds, `start.bat` opens your default browser to the
dashboard automatically — you don't need to navigate there yourself.

## How to start the Streamlit dashboard

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r dashboard\streamlit\requirements.txt
py -m streamlit run dashboard\streamlit\app.py
```

Or run `start.bat streamlit`.

## How to start the React/Next.js application

```powershell
npm install
npm run dev
```

Or run `start.bat react`. `cross-env` handles the environment-variable
syntax difference on Windows.

## How to run backend/server components

The Cloudflare Worker (`server/worker/index.ts`) is served automatically by
`npm run dev` / `npm start` via the Cloudflare Vite plugin and `vinext` —
there is no separate backend process to start.

## How to run tests

Python:

```powershell
py -m unittest discover -s tests
```

JavaScript/TypeScript (builds first, then runs the Node test runner against
the build output and the TypeScript engine directly):

```powershell
npm test
```

## How to build

```powershell
npm run build
```

or double-click `build.bat`, which installs Node dependencies, runs
`npm run build`, and also provisions the Python virtual environment for the
Streamlit dashboard.

## What `start.bat` does

Presents a menu to start the React/Next.js dev server, the Streamlit
dashboard, or both. Installs `node_modules` and/or creates `.venv` and
installs Streamlit's dependencies on first run if they're missing. Polls
the server in the background and opens it in your default browser
(`http://127.0.0.1:5173/` for React, `http://127.0.0.1:8501/` for
Streamlit) as soon as it responds, so you land on the dashboard without
typing a URL.

## What `build.bat` does

Installs Node dependencies (`npm install`), runs the production build
(`npm run build`), then creates `.venv` and installs the Streamlit
dashboard's Python dependencies if Python is available. Intended as the
one-shot "get this repo ready" command after a fresh clone.

## Regenerate the default dataset

```powershell
py scripts\generate_dataset.py
```

The compressed output is written to
`data/processed/rail_forecast_studio.csv.gz`.

## Main project files

```text
src/forecast_studio.py                 Python generator and forecast engine
src/forecast-studio-engine.ts          Browser generator and seven-method forecast engine
dashboard/react/forecast-studio.tsx    React interface
dashboard/streamlit/app.py             Streamlit interface
scripts/generate_dataset.py            Regenerates data/processed/rail_forecast_studio.csv.gz
tests/                                 Leakage, aggregation, model, render, and archive checks
```

All routes, dates, events, prices, bookings, revenue, and outcomes are
synthetic. Results demonstrate the workflow and the candidate's reasoning;
they are not claims about expected performance on real operator data.

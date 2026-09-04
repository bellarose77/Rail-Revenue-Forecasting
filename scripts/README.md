# scripts

Executable developer/data/pipeline scripts, run from the repo root.

- `generate_dataset.py` — regenerates the default synthetic dataset from
  `src/forecast_studio.py` and writes it to
  `data/processed/rail_forecast_studio.csv.gz`. Run with
  `py scripts\generate_dataset.py`.
- `sites-env.sh`, `install-ci.sh`, `build-verified.sh`, `validate-artifact.sh`
  — platform CI plumbing for the hosted "Sites" build/deploy pipeline
  (invoked by the `npm run build` / `install:ci` / `validate:artifact`
  package.json scripts). Not specific to the forecasting project itself.

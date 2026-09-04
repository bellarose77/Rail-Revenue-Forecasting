# data/processed

Lifecycle stage for the final, analysis-ready dataset.

`rail_forecast_studio.csv.gz` is the generated artifact produced by
`scripts/generate_dataset.py` (which calls `generate_dataset()` from
`src/forecast_studio.py`). Regenerate it with:

```powershell
py scripts\generate_dataset.py
```

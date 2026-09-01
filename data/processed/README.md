# data/processed

Lifecycle stage for the final, analysis-ready dataset.

The existing generated artifact (`data/rail_forecast_studio.csv.gz`) has not
been moved here yet — it stays at its current path until the data-generation
script migration in a later pass, so `modeling/generate_forecast_studio.py`
and the README's documented path keep working unchanged. Once that script
moves to `scripts/generate_dataset.py`, it will write here instead.

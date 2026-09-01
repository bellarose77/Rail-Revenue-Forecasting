"""End-to-end forecast orchestration.

Future home of modeling.forecast_studio.run_forecast() — fits every model on
the historical window, predicts the hidden validation block, and scores the
result at daily, weekly, and monthly aggregation. Composes src.data,
src.features, src.models, and src.metrics; contains no modeling logic of its
own. Not yet migrated.
"""

"""Reusable rail booking and revenue forecasting domain logic.

This package holds framework-agnostic data generation, feature engineering,
forecasting models, scoring, and pipeline orchestration for the two-route
rail forecast lab. It has no dependency on Streamlit, Next.js, or any web
framework, so it can be consumed by dashboard/streamlit/ and by any future
Python entry point without modification.

The implementation lives in ``src/forecast_studio.py`` as a single cohesive
module. The ``analysis``, ``data``, ``features``, ``metrics``, ``models``,
and ``pipelines`` subpackages are reserved for a future pass that splits
that module by responsibility; each subpackage's docstring notes what it
would eventually hold. They stay empty until that split happens.
"""

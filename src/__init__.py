"""Reusable rail booking and revenue forecasting domain logic.

This package holds framework-agnostic data generation, feature engineering,
forecasting models, scoring, and pipeline orchestration for the two-route
rail forecast lab. It has no dependency on Streamlit, Next.js, or any web
framework, so it can be consumed by streamlit_app/ and by any future Python
entry point without modification.

Scaffolding only: the implementation still lives in modeling/forecast_studio.py
pending a later migration pass.
"""

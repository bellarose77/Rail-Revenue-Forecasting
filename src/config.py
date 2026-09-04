"""Central project configuration: filesystem paths only.

PROJECT_ROOT is derived from this file's own location on disk
(``Path(__file__).resolve().parents[1]``), not from ``os.getcwd()`` or any
assumption about which directory the interpreter was launched from. Since
this file always lives at ``<project_root>/src/config.py``, walking one
parent up is reliable regardless of whether a consumer is run as
``py scripts\\generate_dataset.py``, ``py -m unittest ...``,
``streamlit run dashboard\\streamlit\\app.py``, or from an IDE with a
different working directory.

This module intentionally holds only paths and other truly project-wide
settings. Domain constants (route definitions, fare-class specs, forecast
horizons, the default random seed, and so on) stay in the domain module
that owns them — currently ``src/forecast_studio.py`` — and move to
``src/data``, ``src/models``, etc. if that module is ever split further, not
here. This file is not a dumping ground for anything that happens to be a
constant.
"""

from __future__ import annotations

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]

DATA_DIR = PROJECT_ROOT / "data"
RAW_DATA_DIR = DATA_DIR / "raw"
INTERIM_DATA_DIR = DATA_DIR / "interim"
PROCESSED_DATA_DIR = DATA_DIR / "processed"

MODEL_DIR = PROJECT_ROOT / "models"

REPORTS_DIR = PROJECT_ROOT / "reports"
FIGURES_DIR = REPORTS_DIR / "figures"
VALIDATION_DIR = REPORTS_DIR / "validation"

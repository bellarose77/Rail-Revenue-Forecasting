# models

Serialized trained model artifacts.

Both current apps (Streamlit and the in-browser React engine) deliberately
refit every model live on each run rather than loading a persisted one —
that live-fitting is part of what the demo shows. This directory is
established for future use (e.g. a caching or export feature) and is empty
by design, not by omission.

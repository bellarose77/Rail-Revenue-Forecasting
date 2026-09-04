# Streamlit forecasting studio

From the project root on Windows PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r dashboard\streamlit\requirements.txt
py -m streamlit run dashboard\streamlit\app.py
```

From macOS or Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r dashboard/streamlit/requirements.txt
python -m streamlit run dashboard/streamlit/app.py
```

The Streamlit and React versions cover the same focused exercise:

- two Montréal rail routes;
- two years of logical synthetic history;
- a hidden August–October 2026 validation block;
- bookings and revenue, total and by Economy/Premium/Business class;
- daily, weekly, and monthly forecasts;
- simple statistical, time-series, booking-curve, ridge, boosted-tree,
  ensemble, and adaptive hybrid approaches;
- live model execution, booking-curve replay, and exact comparison tables.

The project does not compute buy-up or sell-out probabilities.

"""Streamlit interface for the focused ExPretio rail forecasting studio."""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
import streamlit as st


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "modeling"))

from forecast_studio import (  # noqa: E402
    BASE_MODELS,
    DEFAULT_SEED,
    FARE_CLASSES,
    FORECAST_END,
    FORECAST_START,
    HISTORY_END,
    HISTORY_START,
    HORIZONS,
    MODEL_FAMILIES,
    MODEL_LABELS,
    MODELS,
    ROUTES,
    ForecastConfig,
    booking_curve_view,
    class_composition,
    dataset_summary,
    generate_dataset,
    run_forecast,
)


NAVY = "#13263d"
RED = "#c34e45"
OLIVE = "#607355"
SLATE = "#65717a"
IVORY = "#f7f2e8"
PAPER = "#fffdf7"
LINE = "#ddd6c8"
CLASS_COLORS = {
    "Economy": "#cf5c50",
    "Premium": "#506f82",
    "Business": "#71815e",
}

st.set_page_config(
    page_title="ExPretio Rail Forecast Lab",
    page_icon="🚄",
    layout="wide",
)

st.markdown(
    f"""
    <style>
    .stApp {{ background: {IVORY}; color: #1c2a38; }}
    h1, h2, h3 {{ color: {NAVY}; font-family: Georgia, serif !important; }}
    [data-testid="stMetric"] {{
        background: {PAPER}; border: 1px solid {LINE}; border-radius: 8px;
        padding: 14px 17px;
    }}
    [data-testid="stMetricLabel"] {{ color: {SLATE}; }}
    .scope-note {{
        padding: 14px 17px; border: 1px solid {LINE}; border-radius: 8px;
        background: {PAPER}; color: {SLATE}; line-height: 1.55;
    }}
    .model-card {{
        min-height: 150px; padding: 18px; border: 1px solid {LINE};
        border-radius: 8px; background: {PAPER};
    }}
    .model-card b {{ color: {NAVY}; }}
    .model-card small {{ color: {RED}; font-weight: 700; }}
    .model-card p {{ color: {SLATE}; font-size: .86rem; line-height: 1.5; }}
    .truth-note {{
        padding: 10px 14px; color: #3f613a; border-radius: 6px;
        background: #f2f4ec; font-weight: 700;
    }}
    </style>
    """,
    unsafe_allow_html=True,
)


def money(value: float) -> str:
    if abs(value) >= 1_000_000:
        return f"${value / 1_000_000:.2f}M"
    if abs(value) >= 1_000:
        return f"${value / 1_000:.0f}k"
    return f"${value:,.0f}"


def quantity(value: float, target: str) -> str:
    return money(value) if target == "revenue" else f"{value:,.0f}"


def style_chart(
    figure: go.Figure,
    ytitle: str = "",
    xtitle: str = "",
    height: int = 390,
) -> go.Figure:
    figure.update_layout(
        template="plotly_white",
        height=height,
        margin=dict(l=10, r=10, t=40, b=10),
        paper_bgcolor=PAPER,
        plot_bgcolor=PAPER,
        font=dict(color="#34414c", size=12),
        legend=dict(orientation="h", y=1.12, x=0),
        hovermode="x unified",
        xaxis=dict(title=xtitle, showgrid=False),
        yaxis=dict(title=ytitle, gridcolor="#e6e0d5", zeroline=False),
    )
    return figure


@st.cache_data(show_spinner=False)
def cached_dataset(seed: int) -> pd.DataFrame:
    return generate_dataset(seed)


def forecast_figure(result: dict, model: str, target: str) -> go.Figure:
    frame = result["forecasts"].copy()
    figure = go.Figure()
    figure.add_trace(
        go.Scatter(
            x=frame["period"],
            y=frame[f"{model}_upper"],
            mode="lines",
            line=dict(width=0),
            showlegend=False,
            hoverinfo="skip",
        )
    )
    figure.add_trace(
        go.Scatter(
            x=frame["period"],
            y=frame[f"{model}_lower"],
            mode="lines",
            line=dict(width=0),
            fill="tonexty",
            fillcolor="rgba(195,78,69,.14)",
            name="90% interval",
            hoverinfo="skip",
        )
    )
    figure.add_trace(
        go.Scatter(
            x=frame["period"],
            y=frame["actual"],
            mode="lines+markers",
            name="Validation reality",
            line=dict(color=NAVY, width=3),
        )
    )
    figure.add_trace(
        go.Scatter(
            x=frame["period"],
            y=frame[model],
            mode="lines+markers",
            name="Live forecast",
            line=dict(color=RED, width=3),
        )
    )
    ytitle = "Revenue (CAD)" if target == "revenue" else "Bookings"
    return style_chart(figure, ytitle=ytitle)


def render_result_summary(result: dict, model: str) -> None:
    config: ForecastConfig = result["config"]
    metric = result["metrics"].set_index("key").loc[model]
    forecast_total = result["daily"][model].sum()
    actual_total = result["daily"]["actual"].sum()
    observed_total = result["daily"]["observed"].sum()
    columns = st.columns(5)
    columns[0].metric(
        "Three-month forecast", quantity(forecast_total, config.target)
    )
    columns[1].metric(
        "Known at origin", quantity(observed_total, config.target)
    )
    columns[2].metric(
        "Validation reality", quantity(actual_total, config.target)
    )
    columns[3].metric("WAPE", f"{metric.wape:.1f}%")
    columns[4].metric("Bias", f"{metric.bias:+.1f}%")
    st.plotly_chart(
        forecast_figure(result, model, config.target),
        use_container_width=True,
    )


if "seed" not in st.session_state:
    st.session_state.seed = DEFAULT_SEED
if "data" not in st.session_state:
    st.session_state.data = cached_dataset(DEFAULT_SEED)
if "live_result" not in st.session_state:
    st.session_state.live_result = None
if "compare_result" not in st.session_state:
    st.session_state.compare_result = None


st.caption("EXPRETIO CANDIDATE SKILL DEMONSTRATION · LIVE PYTHON MODELS")
st.title("Rail bookings & revenue forecast lab")
st.write(
    "Generate a realistic two-route dataset, run seven forecasting approaches "
    "live, and validate daily, weekly, and monthly forecasts for the next three months."
)
st.markdown(
    """
    <div class="scope-note">
    <b>Focused scope:</b> two routes · two years of history · August–October 2026
    hidden validation · Economy, Premium and Business classes · bookings and
    revenue only. The project does not calculate customer buy-up or sell-out
    probabilities.
    </div>
    """,
    unsafe_allow_html=True,
)

with st.sidebar:
    st.header("Forecast controls")
    route = st.selectbox("Route", list(ROUTES))
    target = st.radio(
        "Target",
        ["bookings", "revenue"],
        format_func=lambda value: "Bookings" if value == "bookings" else "Revenue (CAD)",
    )
    segment = st.selectbox("Fare class", ["All classes", *FARE_CLASSES])
    aggregation = st.radio(
        "Aggregation",
        ["daily", "weekly", "monthly"],
        horizontal=True,
    )
    config = ForecastConfig(
        route=route,
        target=target,
        segment=segment,
        aggregation=aggregation,
    )
    st.divider()
    st.caption(
        f"Training: {HISTORY_START:%b %d, %Y}–{HISTORY_END:%b %d, %Y}"
    )
    st.caption(
        f"Validation: {FORECAST_START:%b %d, %Y}–{FORECAST_END:%b %d, %Y}"
    )

data_tab, live_tab, compare_tab, method_tab = st.tabs(
    [
        "1 · Generate & inspect data",
        "2 · Run one approach",
        "3 · Compare all",
        "Method & scope",
    ]
)

with data_tab:
    st.header("Generate the data, then inspect its logic")
    left, right = st.columns([2, 1])
    with left:
        st.write(
            "The seed changes small residual variation. Route, class, weekday, "
            "season, event, promotion, fare, trend, and booking-curve logic stay fixed."
        )
    with right:
        seed = st.number_input(
            "Reproducible seed",
            min_value=1,
            max_value=2_147_483_647,
            value=int(st.session_state.seed),
            step=1,
        )
        if st.button("Generate dataset", type="primary", use_container_width=True):
            with st.status("Generating structured synthetic rail data…") as status:
                st.write("Applying route and weekday demand patterns")
                st.write("Creating class-specific booking and revenue curves")
                st.write("Holding out the final three months as validation reality")
                st.session_state.data = cached_dataset(int(seed))
                st.session_state.seed = int(seed)
                st.session_state.live_result = None
                st.session_state.compare_result = None
                status.update(label="Dataset generated", state="complete")

    frame = st.session_state.data
    summary = dataset_summary(frame)
    metrics = st.columns(5)
    metrics[0].metric("Routes", "2")
    metrics[1].metric("Historical days", f"{frame.loc[frame.is_history, 'departure_date'].nunique():,}")
    metrics[2].metric("Forecast days", f"{frame.loc[~frame.is_history, 'departure_date'].nunique():,}")
    metrics[3].metric("Fare classes", "3")
    metrics[4].metric("Curve observations", f"{len(frame) * len(HORIZONS):,}")

    left, right = st.columns(2)
    with left:
        st.subheader("Average daily route volume")
        routes = summary["routes"]
        figure = go.Figure(
            go.Bar(
                x=routes["route"],
                y=routes["average_daily_bookings"],
                marker=dict(color=[RED, "#506f82"]),
                text=routes["average_daily_bookings"].round(0),
                textposition="outside",
            )
        )
        st.plotly_chart(
            style_chart(figure, ytitle="Bookings / day"),
            use_container_width=True,
        )
    with right:
        st.subheader("Average bookings by weekday")
        weekday_order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        weekday = summary["weekday"].set_index("weekday").reindex(weekday_order)
        figure = go.Figure(
            go.Bar(
                x=weekday.index,
                y=weekday["bookings"],
                marker=dict(color="#506f82"),
            )
        )
        st.plotly_chart(
            style_chart(figure, ytitle="Bookings / day"),
            use_container_width=True,
        )

    left, right = st.columns(2)
    with left:
        st.subheader("Booking completion by fare class")
        curves = summary["curves"]
        figure = go.Figure()
        for fare_class in FARE_CLASSES:
            selected = curves.loc[curves["fare_class"].eq(fare_class)]
            figure.add_trace(
                go.Scatter(
                    x=selected["horizon"],
                    y=selected["completion"],
                    name=fare_class,
                    mode="lines+markers",
                    line=dict(color=CLASS_COLORS[fare_class], width=3),
                )
            )
        figure.update_xaxes(autorange="reversed")
        st.plotly_chart(
            style_chart(
                figure,
                ytitle="Share of final bookings",
                xtitle="Days before departure",
            ),
            use_container_width=True,
        )
    with right:
        st.subheader("Fare-class composition")
        classes = summary["classes"]
        figure = go.Figure()
        figure.add_trace(
            go.Bar(
                x=classes["fare_class"],
                y=classes["booking_share"],
                name="Booking share",
                marker=dict(color="#506f82"),
            )
        )
        figure.add_trace(
            go.Bar(
                x=classes["fare_class"],
                y=classes["revenue_share"],
                name="Revenue share",
                marker=dict(color=RED),
            )
        )
        figure.update_layout(barmode="group")
        st.plotly_chart(
            style_chart(figure, ytitle="Share of total"),
            use_container_width=True,
        )

    st.subheader("Sample from the hidden validation block")
    sample_columns = [
        "departure_date",
        "route",
        "fare_class",
        "capacity",
        "final_bookings",
        "final_revenue",
        "average_fare",
        "holiday",
        "event",
        "promotion",
    ]
    st.dataframe(
        frame.loc[~frame.is_history, sample_columns].head(12),
        use_container_width=True,
        hide_index=True,
    )
    st.download_button(
        "Download generated CSV",
        frame.to_csv(index=False).encode("utf-8"),
        file_name=f"rail_forecast_studio_seed_{st.session_state.seed}.csv",
        mime="text/csv",
    )

with live_tab:
    st.header("Run one method and watch each stage")
    model = st.selectbox(
        "Approach",
        MODELS,
        index=MODELS.index("hybrid"),
        format_func=lambda key: f"{MODEL_LABELS[key]} · {MODEL_FAMILIES[key]}",
    )
    st.caption(MODEL_LABELS[model])
    if st.button(
        f"Run {MODEL_LABELS[model]}",
        type="primary",
        use_container_width=False,
    ):
        with st.status("Running the forecast live…", expanded=True) as status:
            st.write("1. Freezing the July 31 forecast origin")
            st.write("2. Fitting the historical and calibration windows")
            result = run_forecast(st.session_state.data, config)
            st.write("3. Generating daily predictions and composing aggregations")
            st.write("4. Revealing the hidden validation outcome and scoring")
            status.update(
                label=f"Completed in {result['runtime_ms']:.0f} ms",
                state="complete",
            )
        st.session_state.live_result = result

    result = st.session_state.live_result
    if result is not None and result["config"] == config:
        st.markdown(
            '<div class="truth-note">Forecast completed. Validation reality is now revealed.</div>',
            unsafe_allow_html=True,
        )
        render_result_summary(result, model)

        st.subheader("One complete train departure: curve and future pickup")
        departure = st.selectbox(
            "Departure date",
            result["daily"]["departure_date"],
            index=min(59, len(result["daily"]) - 1),
            format_func=lambda value: (
                f"{pd.Timestamp(value):%b %d, %Y} · "
                f"D-{int(result['daily'].loc[result['daily'].departure_date.eq(value), 'lead'].iloc[0])}"
            ),
        )
        curve, pickup = booking_curve_view(
            st.session_state.data, result, departure, model
        )
        left, right = st.columns([2, 1])
        with left:
            figure = go.Figure()
            for column, color, dash in [
                ("Historical median", "#a6aaa6", "dash"),
                ("Observed at cutoff", OLIVE, "solid"),
                ("Projected curve", RED, "solid"),
                ("Validation reality", NAVY, "dot"),
            ]:
                figure.add_trace(
                    go.Scatter(
                        x=curve["horizon"],
                        y=curve[column],
                        name=column,
                        mode="lines+markers",
                        line=dict(color=color, width=3, dash=dash),
                    )
                )
            figure.update_xaxes(autorange="reversed")
            st.plotly_chart(
                style_chart(
                    figure,
                    ytitle="Revenue (CAD)" if target == "revenue" else "Bookings",
                    xtitle="Days before departure",
                ),
                use_container_width=True,
            )
        with right:
            st.write("Expected future pickup")
            st.dataframe(
                pickup,
                use_container_width=True,
                hide_index=True,
                column_config={
                    "forecast_pickup": st.column_config.NumberColumn(
                        "Forecast", format="%.1f"
                    ),
                    "actual_pickup": st.column_config.NumberColumn(
                        "Reality", format="%.1f"
                    ),
                },
            )

        st.subheader("Three-month forecast composed by fare class")
        composition = class_composition(
            st.session_state.data, config, model
        )
        st.dataframe(
            composition,
            use_container_width=True,
            hide_index=True,
            column_config={
                "forecast_share": st.column_config.ProgressColumn(
                    "Forecast share", min_value=0, max_value=1, format="%.1%%"
                ),
                "actual_share": st.column_config.ProgressColumn(
                    "Reality share", min_value=0, max_value=1, format="%.1%%"
                ),
            },
        )
    elif result is not None:
        st.warning("Filters changed. Run the selected approach again.")

with compare_tab:
    st.header("Run every approach on the same problem")
    st.write(
        "All seven methods receive the same history, booking state, and hidden "
        "validation block. Combined-model weights use only the earlier calibration period."
    )
    if st.button("Run and compare all", type="primary"):
        with st.status("Running all approaches…", expanded=True) as status:
            st.write("Preparing one common future-only validation split")
            st.write("Fitting statistical, time-series, booking-curve, and ML models")
            result = run_forecast(st.session_state.data, config)
            st.write("Building calibration-weighted ensemble and adaptive hybrid")
            st.write("Scoring daily, weekly, and monthly results")
            status.update(
                label=f"Seven approaches completed in {result['runtime_ms']:.0f} ms",
                state="complete",
            )
        st.session_state.compare_result = result

    result = st.session_state.compare_result
    if result is not None and result["config"] == config:
        metrics = result["metrics"]
        best = metrics.iloc[0]
        baseline = metrics.set_index("key").loc["seasonal"]
        improvement = (baseline.wape - best.wape) / baseline.wape * 100
        columns = st.columns(5)
        columns[0].metric("Best approach", MODEL_LABELS[best.key])
        columns[1].metric("Best WAPE", f"{best.wape:.1f}%")
        columns[2].metric("Simple baseline", f"{baseline.wape:.1f}%")
        columns[3].metric("Improvement", f"{improvement:.1f}%")
        columns[4].metric("Runtime", f"{result['runtime_ms']:.0f} ms")

        left, right = st.columns([3, 2])
        with left:
            figure = go.Figure(
                go.Bar(
                    x=metrics["wape"],
                    y=metrics["approach"],
                    orientation="h",
                    marker=dict(
                        color=[
                            OLIVE if key == best.key else RED
                            for key in metrics["key"]
                        ]
                    ),
                    text=metrics["wape"].map(lambda value: f"{value:.1f}%"),
                    textposition="outside",
                )
            )
            figure.update_yaxes(autorange="reversed")
            st.plotly_chart(
                style_chart(figure, xtitle="WAPE", height=430),
                use_container_width=True,
            )
        with right:
            display_model = st.selectbox(
                "Forecast chart model",
                MODELS,
                index=MODELS.index(result["best_model"]),
                format_func=lambda key: MODEL_LABELS[key],
                key="compare_display_model",
            )
            st.markdown(
                f"**{MODEL_FAMILIES[display_model]}**  \n"
                f"{MODEL_LABELS[display_model]}"
            )
            selected = metrics.set_index("key").loc[display_model]
            st.metric("WAPE", f"{selected.wape:.1f}%")
            st.metric("Bias", f"{selected.bias:+.1f}%")
            st.metric("90% interval coverage", f"{selected.coverage_90:.1f}%")

        st.plotly_chart(
            forecast_figure(result, display_model, target),
            use_container_width=True,
        )

        st.subheader("Exact comparison at selected aggregation")
        st.dataframe(
            metrics[
                [
                    "approach",
                    "family",
                    "wape",
                    "mae",
                    "bias",
                    "coverage_90",
                    "calibration_wape",
                ]
            ],
            use_container_width=True,
            hide_index=True,
        )

        st.subheader("Daily, weekly and monthly WAPE")
        matrix = pd.DataFrame(index=MODELS)
        for current_aggregation in ["daily", "weekly", "monthly"]:
            current = result["metrics_by_aggregation"][
                current_aggregation
            ].set_index("key")
            matrix[current_aggregation.title()] = current.loc[MODELS, "wape"]
        matrix.index = [MODEL_LABELS[key] for key in matrix.index]
        st.dataframe(
            matrix.style.format("{:.1f}%").highlight_min(
                axis=0, color="#e7eddf"
            ),
            use_container_width=True,
        )

        st.subheader("Best-model forecast composed by fare class")
        composition = class_composition(
            st.session_state.data, config, result["best_model"]
        )
        figure = go.Figure(
            go.Bar(
                x=composition["fare_class"],
                y=composition["forecast"],
                marker=dict(
                    color=[
                        CLASS_COLORS[value]
                        for value in composition["fare_class"]
                    ]
                ),
                text=composition["forecast_share"].map(
                    lambda value: f"{value:.1%}"
                ),
                textposition="outside",
            )
        )
        st.plotly_chart(
            style_chart(
                figure,
                ytitle="Revenue (CAD)" if target == "revenue" else "Bookings",
            ),
            use_container_width=True,
        )
    elif result is not None:
        st.warning("Filters changed. Run all approaches again.")

with method_tab:
    st.header("What the demonstration is designed to show")
    st.write(
        "The objective is not to produce a production rail RMS. It is to show "
        "that the candidate can structure a forecasting problem, build logical "
        "synthetic data, establish honest baselines, use ML where it helps, "
        "validate forward in time, and explain the results clearly."
    )
    columns = st.columns(3)
    for index, key in enumerate(MODELS):
        with columns[index % 3]:
            st.markdown(
                f"""
                <div class="model-card">
                  <small>{MODEL_FAMILIES[key]}</small><br>
                  <b>{MODEL_LABELS[key]}</b>
                  <p>{
                      "Transparent historical reference."
                      if key == "seasonal"
                      else "Recent level and damped trend."
                      if key == "time_series"
                      else "Completes observed booking pace."
                      if key == "booking_curve"
                      else "Regularized multivariate effects."
                      if key == "ridge"
                      else "Non-linear interactions in a compact boosted model."
                      if key == "boosted"
                      else "Weights models using earlier validation."
                      if key == "ensemble"
                      else "Changes the blend with information available by lead time."
                  }</p>
                </div>
                """,
                unsafe_allow_html=True,
            )
    st.subheader("Validation rules")
    st.markdown(
        """
        - Two full years are available before the forecast origin.
        - The next three months are hidden from model fitting.
        - Ensemble and hybrid weights are learned on an earlier calibration block.
        - The same daily forecasts are composed into weekly and monthly results.
        - WAPE, MAE, signed bias, and 90% interval coverage remain visible.
        - All data, routes, events, and outcomes are synthetic.
        """
    )

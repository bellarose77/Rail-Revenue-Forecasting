"use client";

import { useMemo, useState } from "react";
import {
  BASE_MODEL_KEYS,
  buildBookingCurveView,
  buildClassComposition,
  DEFAULT_SEED,
  exportDatasetCsv,
  FARE_CLASSES,
  type FareClass,
  type ForecastConfig,
  type ForecastPoint,
  type ForecastRun,
  generateSyntheticDataset,
  HORIZONS,
  MODEL_INFO,
  MODEL_KEYS,
  type ModelKey,
  ROUTE_SPECS,
  runForecastStudio,
  type Segment,
  summarizeDataset,
  type SyntheticDataset,
  type TargetMetric,
  type Aggregation,
} from "./forecast-studio-engine";

type TabKey = "data" | "live" | "compare";
type StepState = "waiting" | "running" | "complete";
type RunStep = {
  label: string;
  note: string;
  state: StepState;
};

const INTEGER = new Intl.NumberFormat("en-CA", { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat("en-CA", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const CURRENCY = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});
const LONG_DATE = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const CLASS_COLORS: Record<FareClass, string> = {
  Economy: "#cf5c50",
  Premium: "#506f82",
  Business: "#71815e",
};

function dateLabel(value: string): string {
  return LONG_DATE.format(new Date(`${value}T12:00:00Z`));
}

function valueLabel(value: number, target: TargetMetric): string {
  return target === "revenue" ? CURRENCY.format(value) : INTEGER.format(value);
}

function compactValue(value: number, target: TargetMetric): string {
  if (target === "revenue") {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}k`;
    return CURRENCY.format(value);
  }
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return INTEGER.format(value);
}

function configMatches(run: ForecastRun | null, config: ForecastConfig): boolean {
  if (!run) return false;
  return (
    run.config.route === config.route &&
    run.config.target === config.target &&
    run.config.segment === config.segment &&
    run.config.aggregation === config.aggregation
  );
}

function RailRule() {
  return (
    <div className="studio-rail-rule" aria-hidden="true">
      <span />
      <i />
      <i />
      <b />
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <article className={`studio-metric ${accent ? "accent" : ""}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{note}</span>
    </article>
  );
}

function ConfigControls({
  config,
  onChange,
  compact = false,
}: {
  config: ForecastConfig;
  onChange: (next: ForecastConfig) => void;
  compact?: boolean;
}) {
  return (
    <div className={`studio-controls ${compact ? "compact" : ""}`}>
      <label>
        <span>Route</span>
        <select
          value={config.route}
          onChange={(event) =>
            onChange({ ...config, route: event.target.value })
          }
        >
          {ROUTE_SPECS.map((route) => (
            <option key={route.name}>{route.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Forecast target</span>
        <select
          value={config.target}
          onChange={(event) =>
            onChange({
              ...config,
              target: event.target.value as TargetMetric,
            })
          }
        >
          <option value="bookings">Bookings</option>
          <option value="revenue">Revenue (CAD)</option>
        </select>
      </label>
      <label>
        <span>Fare class</span>
        <select
          value={config.segment}
          onChange={(event) =>
            onChange({ ...config, segment: event.target.value as Segment })
          }
        >
          <option>All classes</option>
          {FARE_CLASSES.map((fareClass) => (
            <option key={fareClass}>{fareClass}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Aggregation</span>
        <select
          value={config.aggregation}
          onChange={(event) =>
            onChange({
              ...config,
              aggregation: event.target.value as Aggregation,
            })
          }
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>
      </label>
    </div>
  );
}

function WorkflowSteps({ steps }: { steps: RunStep[] }) {
  return (
    <ol className="workflow-steps" aria-live="polite">
      {steps.map((step, index) => (
        <li key={step.label} className={step.state}>
          <span>{step.state === "complete" ? "✓" : index + 1}</span>
          <div>
            <strong>{step.label}</strong>
            <p>{step.note}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ForecastChart({
  points,
  model,
  target,
}: {
  points: ForecastPoint[];
  model: ModelKey;
  target: TargetMetric;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = 980;
  const height = 380;
  const pad = { left: 72, right: 24, top: 28, bottom: 58 };
  const values = points.flatMap((point) => [
    point.actual,
    point.lower[model],
    point.upper[model],
  ]);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, maximum * 0.15, 1);
  const minValue = Math.max(0, minimum - range * 0.12);
  const maxValue = maximum + range * 0.12;
  const x = (index: number) =>
    pad.left +
    (index / Math.max(points.length - 1, 1)) *
      (width - pad.left - pad.right);
  const y = (value: number) =>
    pad.top +
    ((maxValue - value) / Math.max(maxValue - minValue, 1)) *
      (height - pad.top - pad.bottom);
  const line = (valuesToDraw: number[]) =>
    valuesToDraw
      .map((value, index) => `${x(index)},${y(value)}`)
      .join(" ");
  const band = [
    ...points.map((point, index) => `${x(index)},${y(point.upper[model])}`),
    ...[...points]
      .reverse()
      .map(
        (point, reverseIndex) =>
          `${x(points.length - reverseIndex - 1)},${y(point.lower[model])}`,
      ),
  ].join(" ");
  const grid = [0, 0.25, 0.5, 0.75, 1].map(
    (ratio) => minValue + ratio * (maxValue - minValue),
  );
  const labelStep = Math.max(1, Math.ceil(points.length / 6));
  const active = activeIndex === null ? null : points[activeIndex];

  return (
    <div className="studio-chart-wrap">
      <div className="studio-chart-legend">
        <span><i className="legend-actual" />Validation reality</span>
        <span><i className="legend-forecast" />Live forecast</span>
        <span><i className="legend-band" />Calibrated 90% interval</span>
      </div>
      <svg
        className="studio-line-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${MODEL_INFO[model].label} forecast compared with hidden validation reality`}
        onMouseLeave={() => setActiveIndex(null)}
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const relative =
            ((event.clientX - box.left) / box.width) * width - pad.left;
          const usable = width - pad.left - pad.right;
          const index = Math.round(
            (relative / usable) * Math.max(points.length - 1, 0),
          );
          setActiveIndex(Math.max(0, Math.min(points.length - 1, index)));
        }}
      >
        {grid.map((value) => (
          <g key={value}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(value)}
              y2={y(value)}
              className="studio-grid-line"
            />
            <text x={pad.left - 12} y={y(value) + 4} textAnchor="end">
              {compactValue(value, target)}
            </text>
          </g>
        ))}
        <polygon points={band} className="studio-interval-band" />
        <polyline
          points={line(points.map((point) => point.actual))}
          className="studio-actual-line"
        />
        <polyline
          points={line(points.map((point) => point.predictions[model]))}
          className="studio-forecast-line"
        />
        {points.map((point, index) =>
          index % labelStep === 0 || index === points.length - 1 ? (
            <text
              key={point.key}
              x={x(index)}
              y={height - 18}
              textAnchor="middle"
            >
              {point.label}
            </text>
          ) : null,
        )}
        {active && activeIndex !== null && (
          <g className="studio-focus">
            <line
              x1={x(activeIndex)}
              x2={x(activeIndex)}
              y1={pad.top}
              y2={height - pad.bottom}
            />
            <circle
              cx={x(activeIndex)}
              cy={y(active.actual)}
              r="5"
              className="actual-dot"
            />
            <circle
              cx={x(activeIndex)}
              cy={y(active.predictions[model])}
              r="5"
              className="forecast-dot"
            />
          </g>
        )}
      </svg>
      {active && activeIndex !== null && (
        <div
          className="studio-tooltip"
          style={{
            left: `${Math.min(
              78,
              Math.max(
                8,
                (activeIndex / Math.max(points.length - 1, 1)) * 88,
              ),
            )}%`,
          }}
        >
          <strong>{active.label}</strong>
          <span>Observed at origin {valueLabel(active.observed, target)}</span>
          <span>Forecast {valueLabel(active.predictions[model], target)}</span>
          <span>Reality {valueLabel(active.actual, target)}</span>
        </div>
      )}
    </div>
  );
}

function BookingCurveChart({
  curve,
  target,
}: {
  curve: ReturnType<typeof buildBookingCurveView>;
  target: TargetMetric;
}) {
  const width = 900;
  const height = 340;
  const pad = { left: 70, right: 24, top: 24, bottom: 54 };
  const maximum =
    Math.max(
      curve.actualFinal,
      curve.predictedFinal,
      ...curve.points.map((point) => point.reality),
    ) * 1.08;
  const x = (index: number) =>
    pad.left +
    (index / Math.max(curve.points.length - 1, 1)) *
      (width - pad.left - pad.right);
  const y = (value: number) =>
    pad.top +
    ((maximum - value) / Math.max(maximum, 1)) *
      (height - pad.top - pad.bottom);
  const historical = curve.points
    .map((point, index) => `${x(index)},${y(point.historicalMedian)}`)
    .join(" ");
  const projected = curve.points
    .map((point, index) => `${x(index)},${y(point.projected)}`)
    .join(" ");
  const reality = curve.points
    .map((point, index) => `${x(index)},${y(point.reality)}`)
    .join(" ");
  const observedPoints = curve.points
    .map((point, index) =>
      point.observed === null ? null : `${x(index)},${y(point.observed)}`,
    )
    .filter(Boolean)
    .join(" ");
  return (
    <div className="studio-chart-wrap curve">
      <div className="studio-chart-legend">
        <span><i className="legend-history" />Historical median</span>
        <span><i className="legend-observed" />Known at cutoff</span>
        <span><i className="legend-forecast" />Projected curve</span>
        <span><i className="legend-actual" />Validation reality</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="studio-line-chart"
        role="img"
        aria-label="Historical, observed, forecast, and validation booking curve"
      >
        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <g key={ratio}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(maximum * ratio)}
              y2={y(maximum * ratio)}
              className="studio-grid-line"
            />
            <text
              x={pad.left - 12}
              y={y(maximum * ratio) + 4}
              textAnchor="end"
            >
              {compactValue(maximum * ratio, target)}
            </text>
          </g>
        ))}
        <polyline points={historical} className="studio-history-line" />
        <polyline points={reality} className="studio-reality-line" />
        <polyline points={projected} className="studio-forecast-line" />
        <polyline points={observedPoints} className="studio-observed-line" />
        {curve.points.map((point, index) => (
          <g key={point.horizon}>
            <text x={x(index)} y={height - 18} textAnchor="middle">
              D-{point.horizon}
            </text>
            {point.horizon === curve.leadAtForecast && (
              <>
                <line
                  x1={x(index)}
                  x2={x(index)}
                  y1={pad.top}
                  y2={height - pad.bottom}
                  className="cutoff-line"
                />
                <text x={x(index) + 8} y={pad.top + 12}>
                  forecast cutoff
                </text>
              </>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function WeekdayChart({
  rows,
}: {
  rows: ReturnType<typeof summarizeDataset>["weekday"];
}) {
  const width = 700;
  const height = 300;
  const pad = { left: 54, right: 20, top: 24, bottom: 44 };
  const maximum = Math.max(...rows.map((row) => row.bookings)) * 1.12;
  const barWidth = (width - pad.left - pad.right) / rows.length;
  const y = (value: number) =>
    pad.top +
    ((maximum - value) / maximum) * (height - pad.top - pad.bottom);
  return (
    <svg
      className="distribution-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Average bookings by weekday"
    >
      {[0.25, 0.5, 0.75, 1].map((ratio) => (
        <line
          key={ratio}
          x1={pad.left}
          x2={width - pad.right}
          y1={y(maximum * ratio)}
          y2={y(maximum * ratio)}
          className="studio-grid-line"
        />
      ))}
      {rows.map((row, index) => (
        <g key={row.label}>
          <rect
            x={pad.left + index * barWidth + 10}
            y={y(row.bookings)}
            width={barWidth - 20}
            height={height - pad.bottom - y(row.bookings)}
            rx="5"
          />
          <text
            x={pad.left + index * barWidth + barWidth / 2}
            y={height - 17}
            textAnchor="middle"
          >
            {row.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function ClassCurveChart({
  rows,
}: {
  rows: ReturnType<typeof summarizeDataset>["classCurves"];
}) {
  const width = 700;
  const height = 300;
  const pad = { left: 54, right: 20, top: 24, bottom: 48 };
  const x = (index: number) =>
    pad.left +
    (index / Math.max(HORIZONS.length - 1, 1)) *
      (width - pad.left - pad.right);
  const y = (value: number) =>
    pad.top + (1 - value) * (height - pad.top - pad.bottom);
  return (
    <div>
      <div className="class-curve-legend">
        {rows.map((row) => (
          <span key={row.fareClass}>
            <i style={{ background: CLASS_COLORS[row.fareClass] }} />
            {row.fareClass}
          </span>
        ))}
      </div>
      <svg
        className="distribution-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Booking completion curves by fare class"
      >
        {[0.25, 0.5, 0.75, 1].map((ratio) => (
          <g key={ratio}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(ratio)}
              y2={y(ratio)}
              className="studio-grid-line"
            />
            <text x={pad.left - 9} y={y(ratio) + 4} textAnchor="end">
              {Math.round(ratio * 100)}%
            </text>
          </g>
        ))}
        {rows.map((row) => (
          <polyline
            key={row.fareClass}
            points={row.values
              .map((value, index) => `${x(index)},${y(value)}`)
              .join(" ")}
            fill="none"
            stroke={CLASS_COLORS[row.fareClass]}
            strokeWidth="4"
          />
        ))}
        {HORIZONS.map((horizon, index) => (
          <text
            key={horizon}
            x={x(index)}
            y={height - 17}
            textAnchor="middle"
          >
            D-{horizon}
          </text>
        ))}
      </svg>
    </div>
  );
}

function DataStudio({
  data,
  onGenerate,
}: {
  data: SyntheticDataset;
  onGenerate: (seed: number) => void;
}) {
  const [seed, setSeed] = useState(String(data.meta.seed));
  const summary = useMemo(() => summarizeDataset(data), [data]);
  return (
    <section className="studio-section" aria-labelledby="data-heading">
      <div className="section-intro">
        <div>
          <p className="studio-eyebrow">01 · Data studio</p>
          <h2 id="data-heading">Generate the data, then inspect its logic</h2>
          <p>
            The dataset is synthetic but structured—not arbitrary. The seed
            changes small residual variation; the two routes, class behaviors,
            seasonality, weekday patterns, events, trend, price logic, and
            booking curves stay intact.
          </p>
        </div>
        <div className="generator-box">
          <label>
            <span>Reproducible seed</span>
            <input
              type="number"
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="primary-action"
            onClick={() => onGenerate(Number(seed) || DEFAULT_SEED)}
          >
            Generate dataset
          </button>
          <button
            type="button"
            className="text-action"
            onClick={() => {
              const csv = exportDatasetCsv(data);
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `rail_forecast_studio_seed_${data.meta.seed}.csv`;
              link.click();
              URL.revokeObjectURL(url);
            }}
          >
            Download generated CSV
          </button>
        </div>
      </div>

      <div className="scope-strip">
        <div><strong>2</strong><span>routes only</span></div>
        <div><strong>{data.meta.historyDays}</strong><span>historical days</span></div>
        <div><strong>{data.meta.forecastDays}</strong><span>forecast days</span></div>
        <div><strong>3</strong><span>fare classes</span></div>
        <div><strong>{INTEGER.format(data.meta.snapshotPoints)}</strong><span>curve observations</span></div>
      </div>

      <div className="studio-grid two">
        <article className="studio-panel">
          <div className="panel-title">
            <div>
              <p className="studio-eyebrow">Volume distribution</p>
              <h3>Two routes with deliberately different demand</h3>
            </div>
            <span className="synthetic-badge">Seed {data.meta.seed}</span>
          </div>
          <div className="route-summary">
            {summary.routes.map((route) => (
              <div key={route.route}>
                <span>{route.route}</span>
                <strong>{INTEGER.format(route.averageDailyBookings)}</strong>
                <small>
                  bookings/day · {CURRENCY.format(route.averageDailyRevenue)} revenue
                </small>
                <i>
                  <b
                    style={{
                      width: `${Math.min(
                        100,
                        (route.averageDailyBookings / route.capacity) * 100,
                      )}%`,
                    }}
                  />
                </i>
                <em>
                  {DECIMAL.format(route.businessShare * 100)}% Business share ·
                  capacity {route.capacity}
                </em>
              </div>
            ))}
          </div>
        </article>
        <article className="studio-panel">
          <p className="studio-eyebrow">Data contract</p>
          <h3>Exactly what is generated</h3>
          <dl className="data-contract">
            <div>
              <dt>Historical training window</dt>
              <dd>{dateLabel(data.meta.historyStart)}–{dateLabel(data.meta.historyEnd)}</dd>
            </div>
            <div>
              <dt>Hidden validation window</dt>
              <dd>{dateLabel(data.meta.forecastStart)}–{dateLabel(data.meta.forecastEnd)}</dd>
            </div>
            <div>
              <dt>Forecast targets</dt>
              <dd>Final bookings and final revenue</dd>
            </div>
            <div>
              <dt>Booking snapshots</dt>
              <dd>D-90, D-60, D-30, D-14, D-7, departure</dd>
            </div>
            <div>
              <dt>Intentional signals</dt>
              <dd>Calendar, trend, route, fare class, event, promotion, fare</dd>
            </div>
            <div>
              <dt>Explicitly outside scope</dt>
              <dd>Sell-out probability and customer buy-up probability</dd>
            </div>
          </dl>
        </article>
      </div>

      <div className="studio-grid two chart-grid">
        <article className="studio-panel">
          <div className="panel-title">
            <div>
              <p className="studio-eyebrow">Weekly structure</p>
              <h3>Average bookings by day of week</h3>
            </div>
          </div>
          <WeekdayChart rows={summary.weekday} />
          <p className="panel-note">
            Midweek business demand and weekend leisure demand differ by route
            and class, giving the models a real pattern to learn.
          </p>
        </article>
        <article className="studio-panel">
          <div className="panel-title">
            <div>
              <p className="studio-eyebrow">Lead-time distribution</p>
              <h3>Historical completion by fare class</h3>
            </div>
          </div>
          <ClassCurveChart rows={summary.classCurves} />
          <p className="panel-note">
            Economy books earlier; Business arrives close to departure. This
            separation is central to the class-level forecasting exercise.
          </p>
        </article>
      </div>

      <article className="studio-panel class-panel">
        <div className="panel-title">
          <div>
            <p className="studio-eyebrow">Fare-class composition</p>
            <h3>Different curves and different revenue contribution</h3>
          </div>
        </div>
        <div className="class-summary-grid">
          {summary.classes.map((row) => (
            <div key={row.fareClass}>
              <i style={{ background: CLASS_COLORS[row.fareClass] }} />
              <h4>{row.fareClass}</h4>
              <strong>{DECIMAL.format(row.bookingShare * 100)}%</strong>
              <span>of bookings</span>
              <strong>{DECIMAL.format(row.revenueShare * 100)}%</strong>
              <span>of revenue</span>
              <small>Avg. fare {CURRENCY.format(row.averageFare)}</small>
              <p>{row.behavior}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="studio-panel">
        <div className="panel-title">
          <div>
            <p className="studio-eyebrow">Row-level check</p>
            <h3>Sample from the hidden three-month validation block</h3>
          </div>
          <span className="truth-badge">Truth withheld during fitting</span>
        </div>
        <div className="table-scroll">
          <table className="studio-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Route</th>
                <th>Class</th>
                <th>Capacity</th>
                <th>Final bookings</th>
                <th>Final revenue</th>
                <th>Average fare</th>
              </tr>
            </thead>
            <tbody>
              {summary.sample.map((record) => (
                <tr key={`${record.date}-${record.route}-${record.fareClass}`}>
                  <td>{dateLabel(record.date)}</td>
                  <td>{record.route}</td>
                  <td>{record.fareClass}</td>
                  <td>{record.capacity}</td>
                  <td>{INTEGER.format(record.bookings)}</td>
                  <td>{CURRENCY.format(record.revenue)}</td>
                  <td>{CURRENCY.format(record.averageFare)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function LiveRun({
  data,
  config,
  onConfigChange,
}: {
  data: SyntheticDataset;
  config: ForecastConfig;
  onConfigChange: (next: ForecastConfig) => void;
}) {
  const [model, setModel] = useState<ModelKey>("hybrid");
  const [run, setRun] = useState<ForecastRun | null>(null);
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [busy, setBusy] = useState(false);
  const [targetDate, setTargetDate] = useState("");
  const [composition, setComposition] = useState<
    ReturnType<typeof buildClassComposition>
  >([]);
  const fresh = configMatches(run, config);
  const metric = run?.metrics.find((row) => row.key === model);
  const curve =
    run && fresh && targetDate
      ? buildBookingCurveView(data, run, targetDate, model)
      : null;

  const runSelected = async () => {
    setBusy(true);
    const sequence: RunStep[] = [
      {
        label: "Freeze the forecast origin",
        note: "Use only the two historical years and the booking state known on July 31, 2026.",
        state: "running",
      },
      {
        label: "Fit the selected approach",
        note: MODEL_INFO[model].explanation,
        state: "waiting",
      },
      {
        label: "Generate the 92-day forecast",
        note: "Predict August through October, then aggregate from the same daily forecast.",
        state: "waiting",
      },
      {
        label: "Reveal validation reality",
        note: "Compare with the withheld synthetic outcome and calculate WAPE, MAE, bias, and coverage.",
        state: "waiting",
      },
    ];
    setSteps(sequence);
    await new Promise((resolve) => setTimeout(resolve, 180));
    sequence[0].state = "complete";
    sequence[1].state = "running";
    setSteps([...sequence]);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const result = runForecastStudio(data, config);
    sequence[1].state = "complete";
    sequence[2].state = "running";
    setSteps([...sequence]);
    await new Promise((resolve) => setTimeout(resolve, 160));
    sequence[2].state = "complete";
    sequence[3].state = "running";
    setSteps([...sequence]);
    const classComposition = buildClassComposition(data, config, model);
    await new Promise((resolve) => setTimeout(resolve, 140));
    sequence[3].state = "complete";
    setSteps([...sequence]);
    setRun(result);
    setComposition(classComposition);
    setTargetDate(result.daily[Math.min(59, result.daily.length - 1)].date);
    setBusy(false);
  };

  const forecastTotal =
    run?.daily.reduce((sum, point) => sum + point.predictions[model], 0) ?? 0;
  const actualTotal =
    run?.daily.reduce((sum, point) => sum + point.actual, 0) ?? 0;
  const observedTotal =
    run?.daily.reduce((sum, point) => sum + point.observed, 0) ?? 0;

  return (
    <section className="studio-section" aria-labelledby="live-heading">
      <div className="section-intro">
        <div>
          <p className="studio-eyebrow">02 · Live approach runner</p>
          <h2 id="live-heading">Run one method and watch each stage</h2>
          <p>
            Every click fits the models again in your browser. The final
            synthetic outcome is not used to create the prediction; it is
            revealed only in the validation step.
          </p>
        </div>
      </div>
      <ConfigControls config={config} onChange={onConfigChange} />

      <div className="runner-layout">
        <aside className="method-picker">
          <p className="studio-eyebrow">Choose an approach</p>
          {MODEL_KEYS.map((key) => (
            <button
              type="button"
              key={key}
              className={model === key ? "active" : ""}
              onClick={() => setModel(key)}
            >
              <span>{MODEL_INFO[key].shortLabel}</span>
              <small>{MODEL_INFO[key].family}</small>
            </button>
          ))}
        </aside>
        <article className="run-console">
          <div className="panel-title">
            <div>
              <p className="studio-eyebrow">{MODEL_INFO[model].family}</p>
              <h3>{MODEL_INFO[model].label}</h3>
              <p>{MODEL_INFO[model].explanation}</p>
            </div>
            <span className="method-strength">{MODEL_INFO[model].strength}</span>
          </div>
          <button
            type="button"
            className="primary-action run-button"
            onClick={runSelected}
            disabled={busy}
          >
            {busy ? "Running live…" : `Run ${MODEL_INFO[model].shortLabel}`}
          </button>
          {steps.length ? (
            <WorkflowSteps steps={steps} />
          ) : (
            <div className="empty-run">
              <strong>Ready to run</strong>
              <p>
                The app will prepare the historical slice, fit the approach,
                create the forecast, and then score the hidden validation block.
              </p>
            </div>
          )}
        </article>
      </div>

      {run && (
        <div className={`run-results ${fresh ? "" : "stale"}`}>
          {!fresh && (
            <div className="stale-message">
              Filters changed. Run the approach again to refresh these results.
            </div>
          )}
          {fresh && metric && (
            <>
              <div className="result-header">
                <div>
                  <p className="studio-eyebrow">Live result</p>
                  <h3>{MODEL_INFO[model].label}</h3>
                </div>
                <span>
                  completed in {DECIMAL.format(run.runtimeMs)} ms · truth revealed
                </span>
              </div>
              <div className="metric-row">
                <MetricCard
                  label="Three-month forecast"
                  value={compactValue(forecastTotal, config.target)}
                  note={`${config.segment} · ${config.route}`}
                  accent
                />
                <MetricCard
                  label="Known at forecast origin"
                  value={compactValue(observedTotal, config.target)}
                  note="on-hand across future departures"
                />
                <MetricCard
                  label="Validation reality"
                  value={compactValue(actualTotal, config.target)}
                  note="withheld until scoring"
                />
                <MetricCard
                  label="WAPE"
                  value={`${DECIMAL.format(metric.wape)}%`}
                  note={`${config.aggregation} accuracy`}
                />
                <MetricCard
                  label="Bias"
                  value={`${metric.bias >= 0 ? "+" : ""}${DECIMAL.format(metric.bias)}%`}
                  note="signed total error"
                />
              </div>

              <article className="studio-panel forecast-result-panel">
                <div className="panel-title">
                  <div>
                    <p className="studio-eyebrow">Forecast versus validation</p>
                    <h3>
                      {config.aggregation[0].toUpperCase() +
                        config.aggregation.slice(1)}{" "}
                      {config.target}
                    </h3>
                  </div>
                  <span className="truth-badge">
                    {dateLabel(run.forecastStart)}–{dateLabel(run.forecastEnd)}
                  </span>
                </div>
                <ForecastChart
                  points={run.points}
                  model={model}
                  target={config.target}
                />
              </article>

              <article className="studio-panel">
                <div className="panel-title">
                  <div>
                    <p className="studio-eyebrow">One complete train departure</p>
                    <h3>Booking/revenue curve replay and future pickup</h3>
                  </div>
                  <label className="inline-select">
                    <span>Departure</span>
                    <select
                      value={targetDate}
                      onChange={(event) => setTargetDate(event.target.value)}
                    >
                      {run.daily.map((point) => (
                        <option key={point.date} value={point.date}>
                          {dateLabel(point.date)} · D-{point.lead}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {curve && (
                  <div className="curve-result-grid">
                    <div>
                      <BookingCurveChart curve={curve} target={config.target} />
                      <p className="panel-note">
                        At D-{curve.leadAtForecast}, the model sees{" "}
                        {valueLabel(curve.observedAtCutoff, config.target)} and
                        projects {valueLabel(curve.predictedFinal, config.target)}.
                        Reality is shown only for validation.
                      </p>
                    </div>
                    <div>
                      <p className="studio-eyebrow">Expected future pickup</p>
                      <h4>What should arrive after the cutoff</h4>
                      <div className="table-scroll">
                        <table className="studio-table compact-table">
                          <thead>
                            <tr>
                              <th>Lead-time range</th>
                              <th>Forecast</th>
                              <th>Reality</th>
                            </tr>
                          </thead>
                          <tbody>
                            {curve.pickupBuckets.map((bucket) => (
                              <tr key={bucket.label}>
                                <td>{bucket.label}</td>
                                <td>{valueLabel(bucket.forecastPickup, config.target)}</td>
                                <td>{valueLabel(bucket.actualPickup, config.target)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </article>

              <ClassComposition
                rows={composition}
                target={config.target}
                title="Three-month forecast composed by fare class"
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function ClassComposition({
  rows,
  target,
  title,
}: {
  rows: ReturnType<typeof buildClassComposition>;
  target: TargetMetric;
  title: string;
}) {
  return (
    <article className="studio-panel composition-panel">
      <div className="panel-title">
        <div>
          <p className="studio-eyebrow">Class composition</p>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="composition-bars">
        {rows.map((row) => (
          <div key={row.fareClass}>
            <span>
              <i style={{ background: CLASS_COLORS[row.fareClass] }} />
              {row.fareClass}
            </span>
            <div>
              <b
                style={{
                  width: `${Math.max(2, row.forecastShare * 100)}%`,
                  background: CLASS_COLORS[row.fareClass],
                }}
              />
            </div>
            <strong>{valueLabel(row.forecast, target)}</strong>
            <small>
              {DECIMAL.format(row.forecastShare * 100)}% forecast ·{" "}
              {DECIMAL.format(row.actualShare * 100)}% reality
            </small>
          </div>
        ))}
      </div>
    </article>
  );
}

function CompareAll({
  data,
  config,
  onConfigChange,
}: {
  data: SyntheticDataset;
  config: ForecastConfig;
  onConfigChange: (next: ForecastConfig) => void;
}) {
  const [run, setRun] = useState<ForecastRun | null>(null);
  const [displayModel, setDisplayModel] = useState<ModelKey>("hybrid");
  const [steps, setSteps] = useState<RunStep[]>([]);
  const [busy, setBusy] = useState(false);
  const [composition, setComposition] = useState<
    ReturnType<typeof buildClassComposition>
  >([]);
  const fresh = configMatches(run, config);

  const runAll = async () => {
    setBusy(true);
    const sequence: RunStep[] = [
      {
        label: "Build one common training and validation split",
        note: "Every approach receives exactly the same historical information and hidden future.",
        state: "running",
      },
      {
        label: "Fit five base approaches",
        note: "Statistical, time-series, booking-curve, linear ML, and boosted-tree models run independently.",
        state: "waiting",
      },
      {
        label: "Build ensemble and adaptive hybrid",
        note: "Weights come from the earlier calibration block, never from the three-month validation result.",
        state: "waiting",
      },
      {
        label: "Score every aggregation",
        note: "Daily, weekly, and monthly WAPE, MAE, bias, and interval coverage are calculated together.",
        state: "waiting",
      },
    ];
    setSteps(sequence);
    await new Promise((resolve) => setTimeout(resolve, 170));
    sequence[0].state = "complete";
    sequence[1].state = "running";
    setSteps([...sequence]);
    const result = runForecastStudio(data, config);
    await new Promise((resolve) => setTimeout(resolve, 180));
    sequence[1].state = "complete";
    sequence[2].state = "running";
    setSteps([...sequence]);
    const classComposition = buildClassComposition(
      data,
      config,
      result.bestModel,
    );
    await new Promise((resolve) => setTimeout(resolve, 150));
    sequence[2].state = "complete";
    sequence[3].state = "running";
    setSteps([...sequence]);
    await new Promise((resolve) => setTimeout(resolve, 150));
    sequence[3].state = "complete";
    setSteps([...sequence]);
    setRun(result);
    setDisplayModel(result.bestModel);
    setComposition(classComposition);
    setBusy(false);
  };

  const selectedMetric = run?.metrics.find(
    (metric) => metric.key === displayModel,
  );
  const best = run?.metrics[0];
  const baseline = run?.metrics.find((metric) => metric.key === "seasonal");
  const improvement =
    best && baseline
      ? ((baseline.wape - best.wape) / Math.max(baseline.wape, 0.01)) * 100
      : 0;

  return (
    <section className="studio-section" aria-labelledby="compare-heading">
      <div className="section-intro compare-intro">
        <div>
          <p className="studio-eyebrow">03 · Comparison lab</p>
          <h2 id="compare-heading">Run every approach on the same problem</h2>
          <p>
            This is the model-selection view: one split, one dataset, one
            forecast horizon, and transparent metrics at daily, weekly, and
            monthly levels.
          </p>
        </div>
        <button
          type="button"
          className="primary-action compare-button"
          onClick={runAll}
          disabled={busy}
        >
          {busy ? "Running all approaches…" : "Run and compare all"}
        </button>
      </div>
      <ConfigControls config={config} onChange={onConfigChange} />
      {steps.length > 0 && (
        <article className="studio-panel compare-workflow">
          <WorkflowSteps steps={steps} />
        </article>
      )}

      {run && (
        <div className={`run-results ${fresh ? "" : "stale"}`}>
          {!fresh && (
            <div className="stale-message">
              Filters changed. Run all approaches again for a valid comparison.
            </div>
          )}
          {fresh && best && baseline && selectedMetric && (
            <>
              <div className="metric-row compare-metrics">
                <MetricCard
                  label="Best approach"
                  value={MODEL_INFO[best.key].shortLabel}
                  note={MODEL_INFO[best.key].family}
                  accent
                />
                <MetricCard
                  label="Best WAPE"
                  value={`${DECIMAL.format(best.wape)}%`}
                  note={`${config.aggregation} validation`}
                />
                <MetricCard
                  label="Simple baseline"
                  value={`${DECIMAL.format(baseline.wape)}%`}
                  note="seasonal median WAPE"
                />
                <MetricCard
                  label="Relative improvement"
                  value={`${DECIMAL.format(improvement)}%`}
                  note="versus simple baseline"
                />
                <MetricCard
                  label="Live runtime"
                  value={`${DECIMAL.format(run.runtimeMs)} ms`}
                  note="all seven approaches"
                />
              </div>

              <div className="studio-grid compare-grid">
                <article className="studio-panel">
                  <div className="panel-title">
                    <div>
                      <p className="studio-eyebrow">Visual ranking</p>
                      <h3>Lower WAPE is better</h3>
                    </div>
                  </div>
                  <div className="ranking-bars">
                    {run.metrics.map((row, index) => {
                      const maximum = Math.max(
                        ...run.metrics.map((metric) => metric.wape),
                      );
                      return (
                        <button
                          type="button"
                          key={row.key}
                          className={displayModel === row.key ? "active" : ""}
                          onClick={() => setDisplayModel(row.key)}
                        >
                          <span>
                            <b>{index + 1}</b>
                            {MODEL_INFO[row.key].shortLabel}
                          </span>
                          <i>
                            <em
                              style={{
                                width: `${Math.max(
                                  4,
                                  (row.wape / maximum) * 100,
                                )}%`,
                              }}
                            />
                          </i>
                          <strong>{DECIMAL.format(row.wape)}%</strong>
                        </button>
                      );
                    })}
                  </div>
                </article>
                <article className="studio-panel model-explainer">
                  <p className="studio-eyebrow">Selected result</p>
                  <h3>{MODEL_INFO[displayModel].label}</h3>
                  <p>{MODEL_INFO[displayModel].explanation}</p>
                  <dl>
                    <div><dt>WAPE</dt><dd>{DECIMAL.format(selectedMetric.wape)}%</dd></div>
                    <div><dt>MAE</dt><dd>{valueLabel(selectedMetric.mae, config.target)}</dd></div>
                    <div><dt>Bias</dt><dd>{selectedMetric.bias >= 0 ? "+" : ""}{DECIMAL.format(selectedMetric.bias)}%</dd></div>
                    <div><dt>90% coverage</dt><dd>{DECIMAL.format(selectedMetric.coverage)}%</dd></div>
                  </dl>
                  {displayModel === "ensemble" || displayModel === "hybrid" ? (
                    <div className="weight-list">
                      <strong>Average blend</strong>
                      {BASE_MODEL_KEYS.map((key) => {
                        const weights =
                          displayModel === "ensemble"
                            ? run.ensembleWeights
                            : run.hybridAverageWeights;
                        return (
                          <span key={key}>
                            {MODEL_INFO[key].shortLabel}
                            <b>{Math.round(weights[key] * 100)}%</b>
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                </article>
              </div>

              <article className="studio-panel forecast-result-panel">
                <div className="panel-title">
                  <div>
                    <p className="studio-eyebrow">Selected model replay</p>
                    <h3>{MODEL_INFO[displayModel].label}: forecast vs reality</h3>
                  </div>
                  <label className="inline-select">
                    <span>Display model</span>
                    <select
                      value={displayModel}
                      onChange={(event) =>
                        setDisplayModel(event.target.value as ModelKey)
                      }
                    >
                      {MODEL_KEYS.map((key) => (
                        <option key={key} value={key}>
                          {MODEL_INFO[key].shortLabel}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <ForecastChart
                  points={run.points}
                  model={displayModel}
                  target={config.target}
                />
              </article>

              <article className="studio-panel">
                <div className="panel-title">
                  <div>
                    <p className="studio-eyebrow">Exact model comparison</p>
                    <h3>Performance table at the selected aggregation</h3>
                  </div>
                </div>
                <div className="table-scroll">
                  <table className="studio-table ranking-table">
                    <thead>
                      <tr>
                        <th>Rank</th>
                        <th>Approach</th>
                        <th>Family</th>
                        <th>WAPE</th>
                        <th>MAE</th>
                        <th>Bias</th>
                        <th>90% coverage</th>
                        <th>Calibration WAPE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {run.metrics.map((row, index) => (
                        <tr
                          key={row.key}
                          className={index === 0 ? "best-row" : ""}
                        >
                          <td>{index + 1}</td>
                          <td><strong>{MODEL_INFO[row.key].shortLabel}</strong></td>
                          <td>{row.family}</td>
                          <td>{DECIMAL.format(row.wape)}%</td>
                          <td>{valueLabel(row.mae, config.target)}</td>
                          <td>{row.bias >= 0 ? "+" : ""}{DECIMAL.format(row.bias)}%</td>
                          <td>{DECIMAL.format(row.coverage)}%</td>
                          <td>{DECIMAL.format(row.calibrationWape)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="studio-panel">
                <div className="panel-title">
                  <div>
                    <p className="studio-eyebrow">Aggregation sensitivity</p>
                    <h3>Daily, weekly, and monthly WAPE from the same forecasts</h3>
                  </div>
                </div>
                <div className="table-scroll">
                  <table className="studio-table matrix-table">
                    <thead>
                      <tr>
                        <th>Approach</th>
                        <th>Daily</th>
                        <th>Weekly</th>
                        <th>Monthly</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MODEL_KEYS.map((key) => (
                        <tr key={key}>
                          <td><strong>{MODEL_INFO[key].shortLabel}</strong></td>
                          {(["daily", "weekly", "monthly"] as Aggregation[]).map(
                            (aggregation) => {
                              const row = run.metricsByAggregation[
                                aggregation
                              ].find((metric) => metric.key === key);
                              const bestForAggregation =
                                run.metricsByAggregation[aggregation][0].key === key;
                              return (
                                <td
                                  key={aggregation}
                                  className={bestForAggregation ? "best-cell" : ""}
                                >
                                  {row ? `${DECIMAL.format(row.wape)}%` : "—"}
                                </td>
                              );
                            },
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="panel-note">
                  All methods first create daily forecasts. Weekly and monthly
                  results are composed from those same daily predictions, so
                  aggregation does not create a separate hidden model.
                </p>
              </article>

              <ClassComposition
                rows={composition}
                target={config.target}
                title={`${MODEL_INFO[run.bestModel].shortLabel} forecast by fare class`}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default function ForecastStudio() {
  const [tab, setTab] = useState<TabKey>("data");
  const [data, setData] = useState(() => generateSyntheticDataset());
  const [generationNote, setGenerationNote] = useState(
    `Dataset ${DEFAULT_SEED} is ready`,
  );
  const [config, setConfig] = useState<ForecastConfig>({
    route: ROUTE_SPECS[0].name,
    target: "bookings",
    segment: "All classes",
    aggregation: "weekly",
  });

  const generate = (seed: number) => {
    setGenerationNote("Generating route, class, calendar, fare, and curve logic…");
    window.setTimeout(() => {
      setData(generateSyntheticDataset(seed));
      setGenerationNote(`Dataset ${seed} generated and validated`);
    }, 120);
  };

  return (
    <main className="forecast-studio">
      <header className="studio-hero">
        <div className="hero-topline">
          <span>Candidate skill demonstration</span>
          <span className="live-status"><i /> Live in-browser modeling</span>
        </div>
        <div className="hero-content">
          <div>
            <p className="studio-eyebrow">Focused rail forecasting prototype</p>
            <h1>Rail bookings &amp; revenue forecast lab</h1>
            <p>
              Generate a realistic two-route dataset, run seven forecasting
              approaches live, and validate daily, weekly, and monthly forecasts
              for the next three months.
            </p>
          </div>
          <div className="hero-scope">
            <span><strong>2 years</strong> historical data</span>
            <span><strong>2 routes</strong> Montréal corridors</span>
            <span><strong>3 classes</strong> Economy · Premium · Business</span>
            <span><strong>3 months</strong> hidden validation</span>
          </div>
        </div>
        <RailRule />
      </header>

      <nav className="studio-tabs" aria-label="Forecast lab sections">
        {[
          ["data", "01", "Generate & inspect data"],
          ["live", "02", "Run one approach"],
          ["compare", "03", "Compare all approaches"],
        ].map(([key, number, label]) => (
          <button
            type="button"
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key as TabKey)}
          >
            <span>{number}</span>
            {label}
          </button>
        ))}
        <p>{generationNote}</p>
      </nav>

      {tab === "data" && <DataStudio data={data} onGenerate={generate} />}
      {tab === "live" && (
        <LiveRun
          data={data}
          config={config}
          onConfigChange={setConfig}
        />
      )}
      {tab === "compare" && (
        <CompareAll
          data={data}
          config={config}
          onConfigChange={setConfig}
        />
      )}

      <footer className="studio-footer">
        <div>
          <strong>Scope reminder</strong>
          <p>
            This is a compact portfolio demonstration using deterministic
            synthetic data. It forecasts booking and revenue quantities; it
            does not estimate buy-up or sell-out probabilities and is not a
            production system.
          </p>
        </div>
        <span>Portfolio demonstration · Montréal</span>
      </footer>
    </main>
  );
}

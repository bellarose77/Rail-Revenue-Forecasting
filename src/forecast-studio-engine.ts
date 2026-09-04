export const DEFAULT_SEED = 20260728;
export const HISTORY_START = "2024-08-01";
export const HISTORY_END = "2026-07-31";
export const FORECAST_START = "2026-08-01";
export const FORECAST_END = "2026-10-31";
export const HORIZONS = [90, 60, 30, 14, 7, 0] as const;

export const ROUTE_SPECS = [
  {
    name: "Montréal–Toronto",
    code: "MTL–TOR",
    baseBookings: 365,
    capacity: 520,
    economyFare: 96,
    description:
      "Longer inter-city route with a strong weekday business component and busy Friday/Sunday travel.",
    classShares: { Economy: 0.5, Premium: 0.29, Business: 0.21 },
    dow: [1.03, 1.02, 1.05, 1.08, 1.15, 0.88, 1.08],
  },
  {
    name: "Montréal–Ottawa",
    code: "MTL–OTT",
    baseBookings: 278,
    capacity: 400,
    economyFare: 68,
    description:
      "Shorter government and business corridor with stronger Tuesday–Thursday demand and softer weekends.",
    classShares: { Economy: 0.55, Premium: 0.28, Business: 0.17 },
    dow: [0.98, 1.1, 1.12, 1.09, 1.01, 0.78, 0.86],
  },
] as const;

export const FARE_CLASSES = ["Economy", "Premium", "Business"] as const;
export type FareClass = (typeof FARE_CLASSES)[number];
export type Segment = "All classes" | FareClass;
export type TargetMetric = "bookings" | "revenue";
export type Aggregation = "daily" | "weekly" | "monthly";

const CLASS_SPECS: Record<
  FareClass,
  {
    fareMultiplier: number;
    completion: number[];
    stageFare: number[];
    dow: number[];
    behavior: string;
  }
> = {
  Economy: {
    fareMultiplier: 1,
    completion: [0.05, 0.18, 0.44, 0.67, 0.83, 1],
    stageFare: [0.84, 0.88, 0.95, 1.03, 1.12, 1.2],
    dow: [0.98, 0.98, 0.99, 1, 1.06, 1.16, 1.13],
    behavior: "Books earliest, responds most to leisure periods and promotions.",
  },
  Premium: {
    fareMultiplier: 1.55,
    completion: [0.025, 0.11, 0.32, 0.54, 0.73, 1],
    stageFare: [0.92, 0.95, 1, 1.06, 1.11, 1.16],
    dow: [1, 1.03, 1.04, 1.04, 1.05, 0.94, 0.96],
    behavior: "Balanced curve, with both advance leisure and close-in business demand.",
  },
  Business: {
    fareMultiplier: 2.38,
    completion: [0.008, 0.045, 0.16, 0.36, 0.57, 1],
    stageFare: [1.01, 1.03, 1.05, 1.08, 1.11, 1.14],
    dow: [1.02, 1.2, 1.24, 1.2, 1.08, 0.52, 0.58],
    behavior: "Books latest and is concentrated on weekdays, especially midweek.",
  },
};

const MONTH_FACTOR = [
  0,
  0.83,
  0.87,
  0.94,
  0.98,
  1.03,
  1.09,
  1.15,
  1.13,
  1.07,
  1.01,
  0.94,
  1.1,
];

export type SyntheticRecord = {
  date: string;
  route: string;
  routeCode: string;
  fareClass: FareClass;
  capacity: number;
  bookings: number;
  revenue: number;
  averageFare: number;
  holiday: boolean;
  event: boolean;
  promotion: boolean;
  bookingCurve: number[];
  revenueCurve: number[];
};

export type SyntheticDataset = {
  meta: {
    seed: number;
    synthetic: true;
    historyStart: string;
    historyEnd: string;
    forecastStart: string;
    forecastEnd: string;
    historyDays: number;
    forecastDays: number;
    routeCount: number;
    classCount: number;
    classDayRows: number;
    snapshotPoints: number;
    note: string;
  };
  records: SyntheticRecord[];
};

export type BaseModelKey =
  | "seasonal"
  | "timeSeries"
  | "bookingCurve"
  | "ridge"
  | "boosted";
export type ModelKey = BaseModelKey | "ensemble" | "hybrid";

export const BASE_MODEL_KEYS: BaseModelKey[] = [
  "seasonal",
  "timeSeries",
  "bookingCurve",
  "ridge",
  "boosted",
];
export const MODEL_KEYS: ModelKey[] = [
  ...BASE_MODEL_KEYS,
  "ensemble",
  "hybrid",
];

export const MODEL_INFO: Record<
  ModelKey,
  {
    label: string;
    shortLabel: string;
    family: string;
    explanation: string;
    strength: string;
  }
> = {
  seasonal: {
    label: "Seasonal historical median",
    shortLabel: "Seasonal median",
    family: "Simple statistical",
    explanation:
      "Uses comparable weekdays and nearby months from the historical window, with a restrained recent-trend adjustment.",
    strength: "Stable, transparent reference",
  },
  timeSeries: {
    label: "Exponential smoothing and trend",
    shortLabel: "Time series",
    family: "Time series",
    explanation:
      "Smooths recent same-weekday history and projects a damped trend into the next three months.",
    strength: "Recent level and trend",
  },
  bookingCurve: {
    label: "Booking-curve completion",
    shortLabel: "Booking curve",
    family: "Rail statistical",
    explanation:
      "Divides bookings or revenue already observed by the historical completion rate at the same lead time.",
    strength: "Uses current booking pace",
  },
  ridge: {
    label: "Regularized linear regression",
    shortLabel: "Ridge ML",
    family: "Interpretable ML",
    explanation:
      "Learns a regularized relationship between on-hand demand, lead time, fare, calendar, event, and trend features.",
    strength: "Clear multivariate effects",
  },
  boosted: {
    label: "Gradient-boosted trees (XGBoost-style)",
    shortLabel: "Boosted trees",
    family: "Non-linear ML",
    explanation:
      "Fits a compact boosted-tree model in the browser to capture non-linear interactions without a large-data pipeline.",
    strength: "Non-linear interactions",
  },
  ensemble: {
    label: "Validation-weighted ensemble",
    shortLabel: "Ensemble",
    family: "Combined",
    explanation:
      "Combines the five base approaches using weights learned only from the earlier calibration window.",
    strength: "Reduces single-model risk",
  },
  hybrid: {
    label: "Lead-time-aware hybrid",
    shortLabel: "Hybrid",
    family: "Adaptive combined",
    explanation:
      "Changes the blend by booking horizon: history has more influence early, while booking pace and ML gain influence close to departure.",
    strength: "Adapts to information available",
  },
};

export type ForecastConfig = {
  route: string;
  target: TargetMetric;
  segment: Segment;
  aggregation: Aggregation;
};

export type ModelMetric = {
  key: ModelKey;
  label: string;
  family: string;
  wape: number;
  mae: number;
  bias: number;
  coverage: number;
  calibrationWape: number;
  weight: number;
};

export type ForecastPoint = {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  actual: number;
  observed: number;
  predictions: Record<ModelKey, number>;
  lower: Record<ModelKey, number>;
  upper: Record<ModelKey, number>;
};

type DailyOutput = {
  date: string;
  actual: number;
  observed: number;
  lead: number;
  predictions: Record<ModelKey, number>;
};

export type ForecastRun = {
  id: string;
  generatedAt: string;
  runtimeMs: number;
  config: ForecastConfig;
  trainStart: string;
  trainEnd: string;
  calibrationStart: string;
  forecastStart: string;
  forecastEnd: string;
  trainingDays: number;
  calibrationDays: number;
  forecastDays: number;
  bestModel: ModelKey;
  metrics: ModelMetric[];
  metricsByAggregation: Record<Aggregation, ModelMetric[]>;
  points: ForecastPoint[];
  daily: DailyOutput[];
  ensembleWeights: Record<BaseModelKey, number>;
  hybridAverageWeights: Record<BaseModelKey, number>;
};

export type BookingCurveView = {
  targetDate: string;
  leadAtForecast: number;
  actualFinal: number;
  observedAtCutoff: number;
  predictedFinal: number;
  points: Array<{
    horizon: number;
    historicalMedian: number;
    observed: number | null;
    projected: number;
    reality: number;
  }>;
  pickupBuckets: Array<{
    label: string;
    forecastPickup: number;
    actualPickup: number;
  }>;
};

export type DatasetSummary = {
  routes: Array<{
    route: string;
    capacity: number;
    averageDailyBookings: number;
    averageDailyRevenue: number;
    businessShare: number;
  }>;
  classes: Array<{
    fareClass: FareClass;
    bookingShare: number;
    revenueShare: number;
    averageFare: number;
    behavior: string;
  }>;
  weekday: Array<{
    label: string;
    bookings: number;
  }>;
  classCurves: Array<{
    fareClass: FareClass;
    values: number[];
  }>;
  sample: SyntheticRecord[];
};

type DailySeriesRow = {
  date: string;
  capacity: number;
  bookings: number;
  revenue: number;
  bookingCurve: number[];
  revenueCurve: number[];
  holiday: boolean;
  event: boolean;
  promotion: boolean;
};

type RidgeModel = {
  means: number[];
  scales: number[];
  coefficients: number[];
};

type Stump = {
  feature: number;
  threshold: number;
  left: number;
  right: number;
};

type BoostedModel = {
  base: number;
  rate: number;
  trees: Stump[];
};

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function clamp(value: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(upper, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

function quantile(values: number[], probability: number): number {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const location = (ordered.length - 1) * probability;
  const lower = Math.floor(location);
  const upper = Math.ceil(location);
  if (lower === upper) return ordered[lower];
  const fraction = location - lower;
  return ordered[lower] * (1 - fraction) + ordered[upper] * fraction;
}

function weightedMean(values: number[], weights: number[]): number {
  const denominator = weights.reduce((sum, value) => sum + value, 0);
  if (!denominator) return median(values);
  return (
    values.reduce(
      (sum, value, index) => sum + value * weights[index],
      0,
    ) / denominator
  );
}

function dateMs(value: string): number {
  return Date.parse(`${value}T12:00:00Z`);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  return formatDate(new Date(dateMs(value) + days * DAY_MS));
}

function daysBetween(left: string, right: string): number {
  return Math.round((dateMs(right) - dateMs(left)) / DAY_MS);
}

function dateRange(start: string, end: string): string[] {
  const count = daysBetween(start, end);
  return Array.from({ length: count + 1 }, (_, index) => addDays(start, index));
}

function dayOfWeek(value: string): number {
  return new Date(dateMs(value)).getUTCDay();
}

function month(value: string): number {
  return new Date(dateMs(value)).getUTCMonth() + 1;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function normal(random: () => number): number {
  const left = Math.max(random(), 1e-12);
  const right = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(left)) * Math.cos(2 * Math.PI * right);
}

function isHoliday(value: string): boolean {
  const parsed = new Date(dateMs(value));
  const currentMonth = parsed.getUTCMonth() + 1;
  const day = parsed.getUTCDate();
  return (
    (currentMonth === 12 && day >= 20) ||
    (currentMonth === 1 && day <= 5) ||
    (currentMonth === 7 && day <= 4) ||
    (currentMonth === 10 && day >= 8 && day <= 14) ||
    (currentMonth === 3 && day >= 1 && day <= 9)
  );
}

function monthDistance(left: number, right: number): number {
  const distance = Math.abs(left - right);
  return Math.min(distance, 12 - distance);
}

export function generateSyntheticDataset(
  seed = DEFAULT_SEED,
): SyntheticDataset {
  const random = mulberry32(seed);
  const dates = dateRange(HISTORY_START, FORECAST_END);
  const records: SyntheticRecord[] = [];

  dates.forEach((date, dayIndex) => {
    const parsed = new Date(dateMs(date));
    const dow = parsed.getUTCDay();
    const currentMonth = parsed.getUTCMonth() + 1;
    const holiday = isHoliday(date);
    const years = daysBetween(HISTORY_START, date) / 365.25;

    ROUTE_SPECS.forEach((route, routeIndex) => {
      const event =
        (dayIndex + routeIndex * 31) % 97 <= 2 ||
        (currentMonth === 9 &&
          parsed.getUTCDate() >= 12 + routeIndex * 5 &&
          parsed.getUTCDate() <= 14 + routeIndex * 5);
      const promotion =
        (Math.floor(dayIndex / 7) + routeIndex * 3) % 11 === 0 &&
        dow >= 2 &&
        dow <= 4;
      const trend = 1 + 0.026 * years;
      const routeNoise = normal(random) * 0.035;
      const regime =
        date >= "2026-01-15"
          ? routeIndex === 0
            ? 1.035
            : 1.02
          : 1;

      const rawBookings = FARE_CLASSES.map((fareClass) => {
        const spec = CLASS_SPECS[fareClass];
        const holidayFactor =
          fareClass === "Economy" ? 1.18 : fareClass === "Business" ? 0.78 : 1.06;
        const eventFactor =
          fareClass === "Business" ? 1.1 : fareClass === "Premium" ? 1.15 : 1.2;
        const promotionFactor =
          promotion && fareClass === "Economy" ? 1.14 : 1;
        const classRegime =
          date >= "2026-01-15" && routeIndex === 0 && fareClass === "Business"
            ? 1.07
            : date >= "2026-01-15" &&
                routeIndex === 1 &&
                fareClass === "Economy"
              ? 1.04
              : 1;
        const mean =
          route.baseBookings *
          route.classShares[fareClass] *
          MONTH_FACTOR[currentMonth] *
          route.dow[dow] *
          spec.dow[dow] *
          trend *
          regime *
          classRegime *
          (holiday ? holidayFactor : 1) *
          (event ? eventFactor : 1) *
          promotionFactor;
        const residual =
          mean * (1 + routeNoise + normal(random) * 0.045) +
          normal(random) * Math.sqrt(mean) * 0.65;
        return Math.max(5, Math.round(residual));
      });

      const rawTotal = rawBookings.reduce((sum, value) => sum + value, 0);
      const scale =
        rawTotal > route.capacity * 0.91
          ? (route.capacity * 0.91) / rawTotal
          : 1;

      FARE_CLASSES.forEach((fareClass, classIndex) => {
        const spec = CLASS_SPECS[fareClass];
        const bookings = Math.max(4, Math.round(rawBookings[classIndex] * scale));
        const completion: number[] = [];
        let priorCompletion = 0;
        spec.completion.forEach((base, index) => {
          const earlyWeight = 1 - index / (HORIZONS.length - 1);
          const calendarShift =
            (holiday && fareClass === "Economy" ? 0.035 * earlyWeight : 0) +
            (event && fareClass !== "Business" ? 0.015 * earlyWeight : 0) -
            (dow >= 1 &&
            dow <= 4 &&
            fareClass === "Business"
              ? 0.012 * earlyWeight
              : 0);
          const value =
            index === HORIZONS.length - 1
              ? 1
              : clamp(
                  base + calendarShift + normal(random) * 0.007,
                  priorCompletion + 0.002,
                  0.97,
                );
          completion.push(value);
          priorCompletion = value;
        });

        const bookingCurve: number[] = [];
        let priorBookings = 0;
        completion.forEach((value, index) => {
          const cumulative =
            index === HORIZONS.length - 1
              ? bookings
              : Math.max(priorBookings, Math.round(bookings * value));
          bookingCurve.push(cumulative);
          priorBookings = cumulative;
        });

        const inflation = 1 + years * 0.018;
        const fareNoise = 1 + normal(random) * 0.018;
        const baseFare =
          route.economyFare *
          spec.fareMultiplier *
          inflation *
          fareNoise *
          (promotion && fareClass === "Economy" ? 0.92 : 1) *
          (event ? 1.025 : 1);
        const revenueCurve: number[] = [];
        let cumulativeRevenue = 0;
        let previousBookingCount = 0;
        bookingCurve.forEach((cumulativeBookings, index) => {
          const pickup = cumulativeBookings - previousBookingCount;
          cumulativeRevenue += pickup * baseFare * spec.stageFare[index];
          revenueCurve.push(round(cumulativeRevenue, 2));
          previousBookingCount = cumulativeBookings;
        });
        const revenue = revenueCurve.at(-1) ?? 0;

        records.push({
          date,
          route: route.name,
          routeCode: route.code,
          fareClass,
          capacity: route.capacity,
          bookings,
          revenue,
          averageFare: round(revenue / Math.max(bookings, 1), 2),
          holiday,
          event,
          promotion,
          bookingCurve,
          revenueCurve,
        });
      });
    });
  });

  const historyDays = dateRange(HISTORY_START, HISTORY_END).length;
  const forecastDays = dateRange(FORECAST_START, FORECAST_END).length;
  return {
    meta: {
      seed,
      synthetic: true,
      historyStart: HISTORY_START,
      historyEnd: HISTORY_END,
      forecastStart: FORECAST_START,
      forecastEnd: FORECAST_END,
      historyDays,
      forecastDays,
      routeCount: ROUTE_SPECS.length,
      classCount: FARE_CLASSES.length,
      classDayRows: records.length,
      snapshotPoints: records.length * HORIZONS.length,
      note:
        "The seed changes only the residual variation. Route, calendar, fare-class, trend, event, promotion, booking-curve, and revenue logic remain fixed.",
    },
    records,
  };
}

function buildDailySeries(
  data: SyntheticDataset,
  config: ForecastConfig,
): DailySeriesRow[] {
  const selected = data.records.filter(
    (record) =>
      record.route === config.route &&
      (config.segment === "All classes" ||
        record.fareClass === config.segment),
  );
  const grouped = new Map<string, DailySeriesRow>();
  selected.forEach((record) => {
    const existing = grouped.get(record.date) ?? {
      date: record.date,
      capacity: record.capacity,
      bookings: 0,
      revenue: 0,
      bookingCurve: HORIZONS.map(() => 0),
      revenueCurve: HORIZONS.map(() => 0),
      holiday: false,
      event: false,
      promotion: false,
    };
    existing.bookings += record.bookings;
    existing.revenue += record.revenue;
    existing.bookingCurve = existing.bookingCurve.map(
      (value, index) => value + record.bookingCurve[index],
    );
    existing.revenueCurve = existing.revenueCurve.map(
      (value, index) => value + record.revenueCurve[index],
    );
    existing.holiday ||= record.holiday;
    existing.event ||= record.event;
    existing.promotion ||= record.promotion;
    grouped.set(record.date, existing);
  });
  return [...grouped.values()].sort((left, right) =>
    left.date.localeCompare(right.date),
  );
}

function actualValue(day: DailySeriesRow, target: TargetMetric): number {
  return target === "bookings" ? day.bookings : day.revenue;
}

function curveValues(day: DailySeriesRow, target: TargetMetric): number[] {
  return target === "bookings" ? day.bookingCurve : day.revenueCurve;
}

function curveAtLead(
  day: DailySeriesRow,
  target: TargetMetric,
  lead: number,
): number {
  const curve = curveValues(day, target);
  if (lead >= HORIZONS[0]) return curve[0];
  if (lead <= 0) return curve.at(-1) ?? 0;
  for (let index = 0; index < HORIZONS.length - 1; index += 1) {
    const farther = HORIZONS[index];
    const closer = HORIZONS[index + 1];
    if (lead <= farther && lead >= closer) {
      const progress = (farther - lead) / (farther - closer);
      return curve[index] * (1 - progress) + curve[index + 1] * progress;
    }
  }
  return curve.at(-1) ?? 0;
}

function fareAtLead(day: DailySeriesRow, lead: number): number {
  const bookings = curveAtLead(day, "bookings", lead);
  const revenue = curveAtLead(day, "revenue", lead);
  return revenue / Math.max(bookings, 1);
}

function targetLead(index: number): number {
  return index + 1;
}

function seasonalPredictor(
  train: DailySeriesRow[],
  target: TargetMetric,
): (day: DailySeriesRow) => number {
  const recent = train.slice(-90).map((day) => actualValue(day, target));
  const prior = train.slice(-180, -90).map((day) => actualValue(day, target));
  const trend =
    prior.length >= 45
      ? clamp(median(recent) / Math.max(median(prior), 1), 0.9, 1.12)
      : 1;
  return (day) => {
    const dow = dayOfWeek(day.date);
    const currentMonth = month(day.date);
    let peers = train.filter(
      (row) =>
        dayOfWeek(row.date) === dow &&
        monthDistance(month(row.date), currentMonth) <= 1,
    );
    if (peers.length < 10) {
      peers = train.filter((row) => dayOfWeek(row.date) === dow);
    }
    return median(
      peers.slice(-20).map((row) => actualValue(row, target)),
    ) * trend;
  };
}

function timeSeriesPredictor(
  train: DailySeriesRow[],
  target: TargetMetric,
): (day: DailySeriesRow) => number {
  const lastDate = train.at(-1)?.date ?? HISTORY_START;
  return (day) => {
    const peers = train
      .filter((row) => dayOfWeek(row.date) === dayOfWeek(day.date))
      .slice(-16);
    const values = peers.map((row) => actualValue(row, target));
    if (values.length < 6) {
      return median(train.slice(-42).map((row) => actualValue(row, target)));
    }
    const weights = values.map((_, index) =>
      0.84 ** (values.length - index - 1),
    );
    const level = weightedMean(values, weights);
    const recent = median(values.slice(-4));
    const previous = median(values.slice(-8, -4));
    const weeklyTrend = clamp(
      (recent - previous) / 4,
      -level * 0.018,
      level * 0.018,
    );
    const weeksAhead = Math.max(0, daysBetween(lastDate, day.date) / 7);
    return Math.max(1, level + weeklyTrend * weeksAhead);
  };
}

function bookingCurvePredictor(
  train: DailySeriesRow[],
  target: TargetMetric,
): (day: DailySeriesRow, lead: number) => number {
  return (day, lead) => {
    const observed = curveAtLead(day, target, lead);
    let peers = train.filter(
      (row) =>
        dayOfWeek(row.date) === dayOfWeek(day.date) &&
        monthDistance(month(row.date), month(day.date)) <= 1,
    );
    if (peers.length < 16) peers = train;
    const completion = clamp(
      median(
        peers
          .slice(-120)
          .map(
            (row) =>
              curveAtLead(row, target, lead) /
              Math.max(actualValue(row, target), 1),
          ),
      ),
      0.01,
      1,
    );
    return Math.max(observed, observed / completion);
  };
}

function featureVector(
  day: DailySeriesRow,
  lead: number,
  target: TargetMetric,
  origin: string,
): number[] {
  const observed = curveAtLead(day, target, lead);
  const bookingsObserved = curveAtLead(day, "bookings", lead);
  const dow = dayOfWeek(day.date);
  const currentMonth = month(day.date);
  return [
    observed,
    target === "bookings"
      ? observed / Math.max(day.capacity, 1)
      : bookingsObserved / Math.max(day.capacity, 1),
    day.capacity,
    fareAtLead(day, lead),
    lead / 90,
    day.holiday ? 1 : 0,
    day.event ? 1 : 0,
    day.promotion ? 1 : 0,
    Math.sin((2 * Math.PI * dow) / 7),
    Math.cos((2 * Math.PI * dow) / 7),
    Math.sin((2 * Math.PI * currentMonth) / 12),
    Math.cos((2 * Math.PI * currentMonth) / 12),
    (dateMs(day.date) - dateMs(origin)) / DAY_MS / 365.25,
  ];
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) {
        pivot = row;
      }
    }
    [augmented[column], augmented[pivot]] = [
      augmented[pivot],
      augmented[column],
    ];
    const divisor = augmented[column][column];
    if (Math.abs(divisor) < 1e-10) continue;
    for (let cell = column; cell <= size; cell += 1) {
      augmented[column][cell] /= divisor;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let cell = column; cell <= size; cell += 1) {
        augmented[row][cell] -= factor * augmented[column][cell];
      }
    }
  }
  return augmented.map((row) =>
    Number.isFinite(row[size]) ? row[size] : 0,
  );
}

function fitRidge(
  features: number[][],
  target: number[],
  lambda = 4,
): RidgeModel {
  const columns = features[0].length;
  const means = Array.from({ length: columns }, (_, column) =>
    features.reduce((sum, row) => sum + row[column], 0) / features.length,
  );
  const scales = Array.from({ length: columns }, (_, column) => {
    const variance =
      features.reduce(
        (sum, row) => sum + (row[column] - means[column]) ** 2,
        0,
      ) / features.length;
    return Math.sqrt(variance) || 1;
  });
  const standardized = features.map((row) => [
    1,
    ...row.map((value, column) => (value - means[column]) / scales[column]),
  ]);
  const size = columns + 1;
  const xtx = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => 0),
  );
  const xty = Array.from({ length: size }, () => 0);
  standardized.forEach((row, rowIndex) => {
    for (let left = 0; left < size; left += 1) {
      xty[left] += row[left] * target[rowIndex];
      for (let right = 0; right < size; right += 1) {
        xtx[left][right] += row[left] * row[right];
      }
    }
  });
  for (let index = 1; index < size; index += 1) xtx[index][index] += lambda;
  return { means, scales, coefficients: solveLinearSystem(xtx, xty) };
}

function predictRidge(model: RidgeModel, features: number[][]): number[] {
  return features.map((row) => {
    const standardized = [
      1,
      ...row.map(
        (value, column) =>
          (value - model.means[column]) / model.scales[column],
      ),
    ];
    return standardized.reduce(
      (sum, value, index) => sum + value * model.coefficients[index],
      0,
    );
  });
}

function fitBoostedTrees(
  features: number[][],
  target: number[],
  estimators = 38,
  rate = 0.075,
): BoostedModel {
  const base = target.reduce((sum, value) => sum + value, 0) / target.length;
  const prediction = target.map(() => base);
  const trees: Stump[] = [];
  const thresholds = Array.from(
    { length: features[0].length },
    (_, feature) => {
      const values = features.map((row) => row[feature]);
      return [0.14, 0.28, 0.43, 0.58, 0.72, 0.86].map((value) =>
        quantile(values, value),
      );
    },
  );

  for (let iteration = 0; iteration < estimators; iteration += 1) {
    const residual = target.map((value, index) => value - prediction[index]);
    let best: Stump | null = null;
    let bestError = Number.POSITIVE_INFINITY;
    thresholds.forEach((featureThresholds, feature) => {
      featureThresholds.forEach((threshold) => {
        let leftCount = 0;
        let leftSum = 0;
        let leftSquare = 0;
        let rightCount = 0;
        let rightSum = 0;
        let rightSquare = 0;
        residual.forEach((value, index) => {
          if (features[index][feature] <= threshold) {
            leftCount += 1;
            leftSum += value;
            leftSquare += value * value;
          } else {
            rightCount += 1;
            rightSum += value;
            rightSquare += value * value;
          }
        });
        if (leftCount < 20 || rightCount < 20) return;
        const error =
          leftSquare -
          (leftSum * leftSum) / leftCount +
          rightSquare -
          (rightSum * rightSum) / rightCount;
        if (error < bestError) {
          bestError = error;
          best = {
            feature,
            threshold,
            left: leftSum / leftCount,
            right: rightSum / rightCount,
          };
        }
      });
    });
    if (!best) break;
    const selected = best;
    trees.push(selected);
    prediction.forEach((value, index) => {
      prediction[index] =
        value +
        rate *
          (features[index][selected.feature] <= selected.threshold
            ? selected.left
            : selected.right);
    });
  }
  return { base, rate, trees };
}

function predictBoosted(model: BoostedModel, features: number[][]): number[] {
  return features.map((row) =>
    model.trees.reduce(
      (prediction, tree) =>
        prediction +
        model.rate *
          (row[tree.feature] <= tree.threshold ? tree.left : tree.right),
      model.base,
    ),
  );
}

function buildBasePredictions(
  train: DailySeriesRow[],
  targets: DailySeriesRow[],
  leads: number[],
  target: TargetMetric,
): Record<BaseModelKey, number[]> {
  const origin = train[0].date;
  const trainingFeatures: number[][] = [];
  const trainingTarget: number[] = [];
  train.forEach((day) => {
    HORIZONS.forEach((lead) => {
      trainingFeatures.push(featureVector(day, lead, target, origin));
      trainingTarget.push(actualValue(day, target));
    });
  });
  const targetFeatures = targets.map((day, index) =>
    featureVector(day, leads[index], target, origin),
  );
  const ridge = fitRidge(trainingFeatures, trainingTarget);
  const boosted = fitBoostedTrees(trainingFeatures, trainingTarget);
  const seasonal = seasonalPredictor(train, target);
  const timeSeries = timeSeriesPredictor(train, target);
  const bookingCurve = bookingCurvePredictor(train, target);
  const floors = targets.map((day, index) =>
    curveAtLead(day, target, leads[index]),
  );

  return {
    seasonal: targets.map((day, index) =>
      Math.max(floors[index], seasonal(day)),
    ),
    timeSeries: targets.map((day, index) =>
      Math.max(floors[index], timeSeries(day)),
    ),
    bookingCurve: targets.map((day, index) =>
      Math.max(floors[index], bookingCurve(day, leads[index])),
    ),
    ridge: predictRidge(ridge, targetFeatures).map((value, index) =>
      Math.max(floors[index], value),
    ),
    boosted: predictBoosted(boosted, targetFeatures).map((value, index) =>
      Math.max(floors[index], value),
    ),
  };
}

function wape(actual: number[], predicted: number[]): number {
  const denominator = actual.reduce((sum, value) => sum + Math.abs(value), 0);
  return (
    (actual.reduce(
      (sum, value, index) => sum + Math.abs(predicted[index] - value),
      0,
    ) /
      Math.max(denominator, 1)) *
    100
  );
}

function normalizeWeights(
  raw: Record<BaseModelKey, number>,
): Record<BaseModelKey, number> {
  const total = BASE_MODEL_KEYS.reduce((sum, key) => sum + raw[key], 0) || 1;
  return Object.fromEntries(
    BASE_MODEL_KEYS.map((key) => [key, raw[key] / total]),
  ) as Record<BaseModelKey, number>;
}

function horizonPriors(lead: number): Record<BaseModelKey, number> {
  if (lead >= 60) {
    return {
      seasonal: 0.3,
      timeSeries: 0.34,
      bookingCurve: 0.09,
      ridge: 0.17,
      boosted: 0.1,
    };
  }
  if (lead >= 30) {
    return {
      seasonal: 0.2,
      timeSeries: 0.23,
      bookingCurve: 0.19,
      ridge: 0.18,
      boosted: 0.2,
    };
  }
  if (lead >= 14) {
    return {
      seasonal: 0.12,
      timeSeries: 0.13,
      bookingCurve: 0.28,
      ridge: 0.19,
      boosted: 0.28,
    };
  }
  return {
    seasonal: 0.06,
    timeSeries: 0.07,
    bookingCurve: 0.4,
    ridge: 0.14,
    boosted: 0.33,
  };
}

function combineFixed(
  predictions: Record<BaseModelKey, number[]>,
  weights: Record<BaseModelKey, number>,
): number[] {
  return predictions.seasonal.map((_, index) =>
    BASE_MODEL_KEYS.reduce(
      (sum, key) => sum + predictions[key][index] * weights[key],
      0,
    ),
  );
}

function combineAdaptive(
  predictions: Record<BaseModelKey, number[]>,
  leads: number[],
  calibrationWape: Record<BaseModelKey, number>,
): {
  values: number[];
  averageWeights: Record<BaseModelKey, number>;
} {
  const totals = Object.fromEntries(
    BASE_MODEL_KEYS.map((key) => [key, 0]),
  ) as Record<BaseModelKey, number>;
  const values = leads.map((lead, index) => {
    const priors = horizonPriors(lead);
    const weights = normalizeWeights(
      Object.fromEntries(
        BASE_MODEL_KEYS.map((key) => [
          key,
          priors[key] / Math.max(calibrationWape[key], 2),
        ]),
      ) as Record<BaseModelKey, number>,
    );
    BASE_MODEL_KEYS.forEach((key) => {
      totals[key] += weights[key];
    });
    return BASE_MODEL_KEYS.reduce(
      (sum, key) => sum + predictions[key][index] * weights[key],
      0,
    );
  });
  return {
    values,
    averageWeights: Object.fromEntries(
      BASE_MODEL_KEYS.map((key) => [key, totals[key] / leads.length]),
    ) as Record<BaseModelKey, number>,
  };
}

function startOfWeek(value: string): string {
  const dow = dayOfWeek(value);
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  return addDays(value, mondayOffset);
}

function aggregationKey(value: string, aggregation: Aggregation): string {
  if (aggregation === "daily") return value;
  if (aggregation === "weekly") return startOfWeek(value);
  return value.slice(0, 7);
}

function aggregationLabel(
  key: string,
  aggregation: Aggregation,
): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: aggregation === "monthly" ? undefined : "numeric",
    year: aggregation === "monthly" ? "numeric" : undefined,
    timeZone: "UTC",
  });
  if (aggregation === "monthly") {
    return formatter.format(new Date(`${key}-01T12:00:00Z`));
  }
  const label = formatter.format(new Date(`${key}T12:00:00Z`));
  return aggregation === "weekly" ? `Week of ${label}` : label;
}

function aggregatePredictions(
  days: DailySeriesRow[],
  leads: number[],
  predictions: Record<ModelKey, number[]>,
  target: TargetMetric,
  aggregation: Aggregation,
): Array<{
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  actual: number;
  observed: number;
  predictions: Record<ModelKey, number>;
}> {
  const grouped = new Map<
    string,
    {
      dates: string[];
      actual: number;
      observed: number;
      predictions: Record<ModelKey, number>;
    }
  >();
  days.forEach((day, index) => {
    const key = aggregationKey(day.date, aggregation);
    const current = grouped.get(key) ?? {
      dates: [],
      actual: 0,
      observed: 0,
      predictions: Object.fromEntries(
        MODEL_KEYS.map((model) => [model, 0]),
      ) as Record<ModelKey, number>,
    };
    current.dates.push(day.date);
    current.actual += actualValue(day, target);
    current.observed += curveAtLead(day, target, leads[index]);
    MODEL_KEYS.forEach((model) => {
      current.predictions[model] += predictions[model][index];
    });
    grouped.set(key, current);
  });
  return [...grouped.entries()].map(([key, value]) => ({
    key,
    label: aggregationLabel(key, aggregation),
    startDate: value.dates[0],
    endDate: value.dates.at(-1) ?? value.dates[0],
    actual: value.actual,
    observed: value.observed,
    predictions: value.predictions,
  }));
}

function scoreAggregation(
  calibration: DailySeriesRow[],
  calibrationLeads: number[],
  calibrationPredictions: Record<ModelKey, number[]>,
  validation: DailySeriesRow[],
  validationLeads: number[],
  validationPredictions: Record<ModelKey, number[]>,
  target: TargetMetric,
  aggregation: Aggregation,
  calibrationWape: Record<BaseModelKey, number>,
  ensembleWeights: Record<BaseModelKey, number>,
): { metrics: ModelMetric[]; points: ForecastPoint[] } {
  const calibrationGroups = aggregatePredictions(
    calibration,
    calibrationLeads,
    calibrationPredictions,
    target,
    aggregation,
  );
  const validationGroups = aggregatePredictions(
    validation,
    validationLeads,
    validationPredictions,
    target,
    aggregation,
  );
  const minimumWidth = target === "bookings" ? 3 : 250;
  const widths = Object.fromEntries(
    MODEL_KEYS.map((model) => [
      model,
      Math.max(
        minimumWidth,
        quantile(
          calibrationGroups.map((group) =>
            Math.abs(group.actual - group.predictions[model]),
          ),
          0.9,
        ),
      ),
    ]),
  ) as Record<ModelKey, number>;

  const points: ForecastPoint[] = validationGroups.map((group) => ({
    ...group,
    lower: Object.fromEntries(
      MODEL_KEYS.map((model) => [
        model,
        Math.max(group.observed, group.predictions[model] - widths[model]),
      ]),
    ) as Record<ModelKey, number>,
    upper: Object.fromEntries(
      MODEL_KEYS.map((model) => [
        model,
        group.predictions[model] + widths[model],
      ]),
    ) as Record<ModelKey, number>,
  }));

  const actual = points.map((point) => point.actual);
  const denominator = Math.max(
    1,
    actual.reduce((sum, value) => sum + Math.abs(value), 0),
  );
  const metrics = MODEL_KEYS.map((model) => {
    const predicted = points.map((point) => point.predictions[model]);
    const errors = predicted.map((value, index) => value - actual[index]);
    const coverage =
      (points.filter(
        (point) =>
          point.actual >= point.lower[model] &&
          point.actual <= point.upper[model],
      ).length /
        points.length) *
      100;
    const calibrationActual = calibrationGroups.map((group) => group.actual);
    const calibrationPredicted = calibrationGroups.map(
      (group) => group.predictions[model],
    );
    return {
      key: model,
      label: MODEL_INFO[model].label,
      family: MODEL_INFO[model].family,
      wape: wape(actual, predicted),
      mae:
        errors.reduce((sum, value) => sum + Math.abs(value), 0) /
        Math.max(errors.length, 1),
      bias: (errors.reduce((sum, value) => sum + value, 0) / denominator) * 100,
      coverage,
      calibrationWape:
        model in calibrationWape
          ? calibrationWape[model as BaseModelKey]
          : wape(calibrationActual, calibrationPredicted),
      weight:
        model in ensembleWeights
          ? ensembleWeights[model as BaseModelKey]
          : 1,
    };
  }).sort((left, right) => left.wape - right.wape);
  return { metrics, points };
}

export function runForecastStudio(
  data: SyntheticDataset,
  config: ForecastConfig,
): ForecastRun {
  const started = performance.now();
  const series = buildDailySeries(data, config);
  const history = series.filter((day) => day.date <= data.meta.historyEnd);
  const validation = series.filter((day) => day.date >= data.meta.forecastStart);
  if (history.length < 700 || validation.length < 90) {
    throw new Error("The generated dataset does not contain the required windows.");
  }

  const calibrationDays = validation.length;
  const fit = history.slice(0, -calibrationDays);
  const calibration = history.slice(-calibrationDays);
  const calibrationLeads = calibration.map((_, index) => targetLead(index));
  const validationLeads = validation.map((_, index) => targetLead(index));
  const calibrationBase = buildBasePredictions(
    fit,
    calibration,
    calibrationLeads,
    config.target,
  );
  const calibrationActual = calibration.map((day) =>
    actualValue(day, config.target),
  );
  const calibrationWape = Object.fromEntries(
    BASE_MODEL_KEYS.map((key) => [
      key,
      wape(calibrationActual, calibrationBase[key]),
    ]),
  ) as Record<BaseModelKey, number>;
  const ensembleWeights = normalizeWeights(
    Object.fromEntries(
      BASE_MODEL_KEYS.map((key) => [
        key,
        1 / Math.max(calibrationWape[key], 1.5) ** 1.55,
      ]),
    ) as Record<BaseModelKey, number>,
  );
  const calibrationHybrid = combineAdaptive(
    calibrationBase,
    calibrationLeads,
    calibrationWape,
  );
  const calibrationPredictions = {
    ...calibrationBase,
    ensemble: combineFixed(calibrationBase, ensembleWeights),
    hybrid: calibrationHybrid.values,
  } as Record<ModelKey, number[]>;

  const validationBase = buildBasePredictions(
    history,
    validation,
    validationLeads,
    config.target,
  );
  const validationHybrid = combineAdaptive(
    validationBase,
    validationLeads,
    calibrationWape,
  );
  const validationPredictions = {
    ...validationBase,
    ensemble: combineFixed(validationBase, ensembleWeights),
    hybrid: validationHybrid.values,
  } as Record<ModelKey, number[]>;

  const metricsByAggregation = {} as Record<Aggregation, ModelMetric[]>;
  let points: ForecastPoint[] = [];
  (["daily", "weekly", "monthly"] as Aggregation[]).forEach((aggregation) => {
    const scored = scoreAggregation(
      calibration,
      calibrationLeads,
      calibrationPredictions,
      validation,
      validationLeads,
      validationPredictions,
      config.target,
      aggregation,
      calibrationWape,
      ensembleWeights,
    );
    metricsByAggregation[aggregation] = scored.metrics;
    if (aggregation === config.aggregation) points = scored.points;
  });

  const metrics = metricsByAggregation[config.aggregation];
  const daily = validation.map((day, index) => ({
    date: day.date,
    actual: actualValue(day, config.target),
    observed: curveAtLead(day, config.target, validationLeads[index]),
    lead: validationLeads[index],
    predictions: Object.fromEntries(
      MODEL_KEYS.map((model) => [model, validationPredictions[model][index]]),
    ) as Record<ModelKey, number>,
  }));

  return {
    id: `${data.meta.seed}-${config.route}-${config.target}-${config.segment}-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    runtimeMs: performance.now() - started,
    config,
    trainStart: history[0].date,
    trainEnd: history.at(-1)?.date ?? data.meta.historyEnd,
    calibrationStart: calibration[0].date,
    forecastStart: validation[0].date,
    forecastEnd: validation.at(-1)?.date ?? data.meta.forecastEnd,
    trainingDays: history.length,
    calibrationDays: calibration.length,
    forecastDays: validation.length,
    bestModel: metrics[0].key,
    metrics,
    metricsByAggregation,
    points,
    daily,
    ensembleWeights,
    hybridAverageWeights: validationHybrid.averageWeights,
  };
}

export function buildBookingCurveView(
  data: SyntheticDataset,
  run: ForecastRun,
  targetDate: string,
  model: ModelKey,
): BookingCurveView {
  const series = buildDailySeries(data, run.config);
  const history = series.filter((day) => day.date <= data.meta.historyEnd);
  const target = series.find((day) => day.date === targetDate);
  const output = run.daily.find((day) => day.date === targetDate);
  if (!target || !output) throw new Error("The selected departure is unavailable.");
  const lead = output.lead;
  const observed = curveAtLead(target, run.config.target, lead);
  const peers = history
    .map((day) => ({
      day,
      score:
        Math.abs(curveAtLead(day, run.config.target, lead) - observed) /
          Math.max(observed, 1) +
        (dayOfWeek(day.date) === dayOfWeek(target.date) ? 0 : 0.3) +
        (monthDistance(month(day.date), month(target.date)) <= 1 ? 0 : 0.2) +
        (day.event === target.event ? 0 : 0.12) +
        (day.holiday === target.holiday ? 0 : 0.12),
    }))
    .sort((left, right) => left.score - right.score)
    .slice(0, 16)
    .map((item) => item.day);
  const horizons = [...new Set([...HORIZONS, lead])].sort(
    (left, right) => right - left,
  );
  let priorProjection = 0;
  const points = horizons.map((horizon) => {
    const historicalMedian = median(
      peers.map((day) => curveAtLead(day, run.config.target, horizon)),
    );
    const completion = clamp(
      median(
        peers.map(
          (day) =>
            curveAtLead(day, run.config.target, horizon) /
            Math.max(actualValue(day, run.config.target), 1),
        ),
      ),
      0.005,
      1,
    );
    const known = horizon >= lead;
    const projected = known
      ? curveAtLead(target, run.config.target, horizon)
      : Math.max(observed, output.predictions[model] * completion);
    priorProjection = Math.max(priorProjection, projected);
    return {
      horizon,
      historicalMedian,
      observed: known
        ? curveAtLead(target, run.config.target, horizon)
        : null,
      projected: priorProjection,
      reality: curveAtLead(target, run.config.target, horizon),
    };
  });
  const cutoffIndex = points.findIndex((point) => point.horizon === lead);
  const pickupBuckets = points
    .slice(cutoffIndex, -1)
    .map((point, index) => {
      const next = points[cutoffIndex + index + 1];
      return {
        label:
          next.horizon === 0
            ? `D-${point.horizon} to departure`
            : `D-${point.horizon} to D-${next.horizon}`,
        forecastPickup: Math.max(0, next.projected - point.projected),
        actualPickup: Math.max(0, next.reality - point.reality),
      };
    });
  return {
    targetDate,
    leadAtForecast: lead,
    actualFinal: actualValue(target, run.config.target),
    observedAtCutoff: observed,
    predictedFinal: output.predictions[model],
    points,
    pickupBuckets,
  };
}

export function buildClassComposition(
  data: SyntheticDataset,
  config: ForecastConfig,
  model: ModelKey,
): Array<{
  fareClass: FareClass;
  forecast: number;
  actual: number;
  forecastShare: number;
  actualShare: number;
}> {
  const rows = FARE_CLASSES.map((fareClass) => {
    const run = runForecastStudio(data, {
      ...config,
      segment: fareClass,
      aggregation: "monthly",
    });
    return {
      fareClass,
      forecast: run.daily.reduce(
        (sum, point) => sum + point.predictions[model],
        0,
      ),
      actual: run.daily.reduce((sum, point) => sum + point.actual, 0),
    };
  });
  const forecastTotal = rows.reduce((sum, row) => sum + row.forecast, 0);
  const actualTotal = rows.reduce((sum, row) => sum + row.actual, 0);
  return rows.map((row) => ({
    ...row,
    forecastShare: row.forecast / Math.max(forecastTotal, 1),
    actualShare: row.actual / Math.max(actualTotal, 1),
  }));
}

export function summarizeDataset(data: SyntheticDataset): DatasetSummary {
  const history = data.records.filter(
    (record) => record.date <= data.meta.historyEnd,
  );
  const routes = ROUTE_SPECS.map((route) => {
    const selected = history.filter((record) => record.route === route.name);
    const business = selected
      .filter((record) => record.fareClass === "Business")
      .reduce((sum, record) => sum + record.bookings, 0);
    const total = selected.reduce((sum, record) => sum + record.bookings, 0);
    return {
      route: route.name,
      capacity: route.capacity,
      averageDailyBookings: total / data.meta.historyDays,
      averageDailyRevenue:
        selected.reduce((sum, record) => sum + record.revenue, 0) /
        data.meta.historyDays,
      businessShare: business / Math.max(total, 1),
    };
  });
  const totalBookings = history.reduce(
    (sum, record) => sum + record.bookings,
    0,
  );
  const totalRevenue = history.reduce(
    (sum, record) => sum + record.revenue,
    0,
  );
  const classes = FARE_CLASSES.map((fareClass) => {
    const selected = history.filter((record) => record.fareClass === fareClass);
    const bookings = selected.reduce((sum, record) => sum + record.bookings, 0);
    const revenue = selected.reduce((sum, record) => sum + record.revenue, 0);
    return {
      fareClass,
      bookingShare: bookings / Math.max(totalBookings, 1),
      revenueShare: revenue / Math.max(totalRevenue, 1),
      averageFare: revenue / Math.max(bookings, 1),
      behavior: CLASS_SPECS[fareClass].behavior,
    };
  });
  const weekday = WEEKDAYS.map((label, dow) => {
    const selected = history.filter(
      (record) => dayOfWeek(record.date) === dow,
    );
    const uniqueDays = new Set(selected.map((record) => record.date)).size;
    return {
      label,
      bookings:
        selected.reduce((sum, record) => sum + record.bookings, 0) /
        Math.max(uniqueDays, 1),
    };
  });
  const classCurves = FARE_CLASSES.map((fareClass) => {
    const selected = history.filter((record) => record.fareClass === fareClass);
    return {
      fareClass,
      values: HORIZONS.map((_, index) =>
        median(
          selected.map(
            (record) =>
              record.bookingCurve[index] / Math.max(record.bookings, 1),
          ),
        ),
      ),
    };
  });
  return {
    routes,
    classes,
    weekday,
    classCurves,
    sample: data.records
      .filter((record) => record.date >= data.meta.forecastStart)
      .slice(0, 8),
  };
}

export function exportDatasetCsv(data: SyntheticDataset): string {
  const header = [
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
    ...HORIZONS.map((horizon) => `bookings_d${horizon}`),
    ...HORIZONS.map((horizon) => `revenue_d${horizon}`),
  ];
  const rows = data.records.map((record) => [
    record.date,
    record.route,
    record.fareClass,
    record.capacity,
    record.bookings,
    round(record.revenue, 2),
    record.averageFare,
    Number(record.holiday),
    Number(record.event),
    Number(record.promotion),
    ...record.bookingCurve,
    ...record.revenueCurve.map((value) => round(value, 2)),
  ]);
  return [header, ...rows]
    .map((row) =>
      row
        .map((value) => {
          const text = String(value);
          return text.includes(",") ? `"${text.replaceAll('"', '""')}"` : text;
        })
        .join(","),
    )
    .join("\n");
}

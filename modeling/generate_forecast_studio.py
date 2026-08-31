"""Generate the default focused rail forecasting dataset."""

from __future__ import annotations

from pathlib import Path

from forecast_studio import DEFAULT_SEED, generate_dataset


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    output = root / "data" / "rail_forecast_studio.csv.gz"
    frame = generate_dataset(DEFAULT_SEED)
    frame.to_csv(output, index=False, compression="gzip")
    print(f"Wrote {len(frame):,} class-day rows to {output}")


if __name__ == "__main__":
    main()

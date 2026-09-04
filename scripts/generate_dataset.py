"""Generate the default focused rail forecasting dataset."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.forecast_studio import DEFAULT_SEED, generate_dataset  # noqa: E402


def main() -> None:
    output = ROOT / "data" / "processed" / "rail_forecast_studio.csv.gz"
    frame = generate_dataset(DEFAULT_SEED)
    frame.to_csv(output, index=False, compression="gzip")
    print(f"Wrote {len(frame):,} class-day rows to {output}")


if __name__ == "__main__":
    main()

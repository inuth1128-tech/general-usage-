"""Convert run_kronos.py output (paths.npz) + candle CSV into the JSON that desk.html loads.

  python paths_to_json.py --npz paths.npz --csv XAUUSD.csv --symbol XAU/USD --step-minutes 5 --out paths.json
  # optional: closes that happened after the forecast started
  python paths_to_json.py ... --realized-csv later_candles.csv
"""
import argparse, json
import numpy as np
import pandas as pd

a = argparse.ArgumentParser()
a.add_argument("--npz", required=True)
a.add_argument("--csv", required=True, help="candles up to NOW (the forecast origin)")
a.add_argument("--symbol", default="XAU/USD")
a.add_argument("--step-minutes", type=int, default=5)
a.add_argument("--history", type=int, default=128)
a.add_argument("--realized-csv", default=None)
a.add_argument("--out", default="paths.json")
a = a.parse_args()

close = np.load(a.npz)["close"]
hist = pd.read_csv(a.csv)["close"].tail(a.history).round(2).tolist()
out = {"symbol": a.symbol, "step_minutes": a.step_minutes, "now": hist[-1],
       "history": hist, "paths": np.round(close, 2).tolist()}
if a.realized_csv:
    out["realized"] = pd.read_csv(a.realized_csv)["close"].head(close.shape[1]).round(2).tolist()
json.dump(out, open(a.out, "w"))
print(f"wrote {a.out}: {close.shape[0]} paths x {close.shape[1]} steps")

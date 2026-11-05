"""Second opinion that does NOT use Kronos: replay the stock's own history.

 1. Block-bootstrap 10,000 synthetic 48-candle futures from the stock's own candles.
 2. Find every past time the setup fired (default: close breaks the prior N-candle high),
    follow the next 48 real candles, and race them to the same stop/target.
 3. Optionally compare with Kronos' result (paths.npz from run_kronos.py).

  python timemachine.py --csv data.csv --stop-pct 1.5 --target-pct 3
  python timemachine.py --csv data.csv --stop-pct 1.5 --target-pct 3 --kronos-npz paths.npz --entry 100 
"""
import argparse
import numpy as np
import pandas as pd
from analysis import race


def bootstrap_paths(df, n_paths, horizon, block, seed=0):
    """Resample (close return, high, low) tuples in blocks, so volatility clustering survives.
    All three are stored relative to the previous close; returns arrays of RELATIVE price
    (entry = 1.0): high, low, close, each (n_paths, horizon)."""
    rng = np.random.default_rng(seed)
    pc = df["close"].shift(1)
    m = pc.notna().values
    r = np.log(df["close"].values[m] / pc.values[m])
    hi = np.log(df["high"].values[m] / pc.values[m])
    lo = np.log(df["low"].values[m] / pc.values[m])
    n = len(r)
    nb = -(-horizon // block)
    starts = rng.integers(0, max(n - block, 1), size=(n_paths, nb))
    idx = (starts[:, :, None] + np.arange(block)).reshape(n_paths, -1)[:, :horizon]
    idx = np.minimum(idx, n - 1)
    cum = np.cumsum(r[idx], axis=1)
    prev = np.concatenate([np.zeros((n_paths, 1)), cum[:, :-1]], axis=1)
    return (np.exp(prev + hi[idx]), np.exp(prev + lo[idx]), np.exp(cum))


def breakout_signals(df, n=20):
    """Setup = close above the highest high of the previous n candles. Replace with your own."""
    prior_high = df["high"].shift(1).rolling(n).max()
    return np.where((df["close"] > prior_high).values)[0]


def historical_analogs(df, signals, horizon, stop_pct, target_pct, side):
    """Real outcomes after each past signal (entry = signal candle's close)."""
    H, L = [], []
    for i in signals:
        if i + horizon >= len(df):
            continue
        entry = df["close"].iloc[i]
        w = df.iloc[i + 1:i + 1 + horizon]
        H.append(w["high"].values / entry)
        L.append(w["low"].values / entry)
    return np.array(H), np.array(L)


def levels(side, stop_pct, target_pct):
    s = stop_pct / 100
    t = target_pct / 100
    return (1 - s, 1 + t) if side == "long" else (1 + s, 1 - t)


def verdict(results, min_edge=5.0):
    """Trade only if every source favors the target by at least min_edge percentage points."""
    edges = {k: v["target_first_pct"] - v["stop_first_pct"] for k, v in results.items() if v}
    ok = all(e >= min_edge for e in edges.values())
    return ok, edges


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--csv", required=True)
    a.add_argument("--horizon", type=int, default=48)
    a.add_argument("--paths", type=int, default=10000)
    a.add_argument("--block", type=int, default=8)
    a.add_argument("--breakout-n", type=int, default=20)
    a.add_argument("--stop-pct", type=float, required=True)
    a.add_argument("--target-pct", type=float, required=True)
    a.add_argument("--side", default="long", choices=["long", "short"])
    a.add_argument("--kronos-npz", default=None)
    a.add_argument("--entry", type=float, default=None, help="entry price (default: last close)")
    a.add_argument("--min-edge", type=float, default=5.0)
    a = a.parse_args()

    df = pd.read_csv(a.csv)
    stop, target = levels(a.side, a.stop_pct, a.target_pct)
    res = {}

    h, l, _ = bootstrap_paths(df, a.paths, a.horizon, a.block)
    res["bootstrap"] = race(h, l, stop, target, a.side)
    print(f"bootstrap ({a.paths} replays): {res['bootstrap']}")

    sig = breakout_signals(df, a.breakout_n)
    H, L = historical_analogs(df, sig, a.horizon, a.stop_pct, a.target_pct, a.side)
    if len(H) >= 20:
        res["analogs"] = race(H, L, stop, target, a.side)
        print(f"analogs ({len(H)} past signals): {res['analogs']}")
    else:
        res["analogs"] = None
        print(f"analogs: only {len(H)} usable past signals - too few to trust, ignored")

    if a.kronos_npz:
        z = np.load(a.kronos_npz)
        entry = a.entry or df["close"].iloc[-1]
        res["kronos"] = race(z["high"] / entry, z["low"] / entry, stop, target, a.side)
        print(f"kronos ({len(z['high'])} paths): {res['kronos']}")

    ok, edges = verdict(res, a.min_edge)
    print("edge (target% - stop%):", {k: round(v, 1) for k, v in edges.items()})
    print("VERDICT:", "sources agree -> trade is not ruled out" if ok else "SKIP: a source disagrees or edge too small")


if __name__ == "__main__":
    main()

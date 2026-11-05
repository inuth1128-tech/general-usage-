"""Rank instruments by what is moving right now (volatility, volume, breakout, trend, RSI).

Data from CSV files (columns: timestamps, open, high, low, close, volume optional) or from a
running MT5 terminal (Windows):

  python scanner.py --csv XAUUSD.csv XAGUSD.csv
  python scanner.py --mt5 XAUUSD XAGUSD EURUSD --timeframe M15

Output is a screen, not a signal: it says what is active, not which way price will go.
`stop_1.5atr` is a starting point for the stop distance you feed into budget_risk.py.
"""
import argparse
import os
import numpy as np
import pandas as pd


def rsi(close, n=14):
    d = close.diff()
    up = d.clip(lower=0).ewm(alpha=1 / n, adjust=False).mean()
    dn = (-d.clip(upper=0)).ewm(alpha=1 / n, adjust=False).mean()
    return 100 - 100 / (1 + up / dn.replace(0, np.nan))


def atr(df, n=14):
    pc = df["close"].shift(1)
    tr = pd.concat([df["high"] - df["low"], (df["high"] - pc).abs(), (df["low"] - pc).abs()], axis=1).max(axis=1)
    return tr.ewm(alpha=1 / n, adjust=False).mean()


def features(df, breakout_n=20):
    """Metrics for the latest candle of one instrument."""
    c = df["close"]
    a = atr(df)
    f = {"price": c.iloc[-1], "atr": a.iloc[-1], "atr_pct": a.iloc[-1] / c.iloc[-1] * 100,
         "atr_vs_avg": a.iloc[-1] / a.iloc[-100:].mean() if len(a) >= 100 else np.nan}
    f["rel_volume"] = (df["volume"].iloc[-1] / df["volume"].iloc[-21:-1].mean()
                       if "volume" in df and df["volume"].iloc[-21:-1].mean() > 0 else np.nan)
    prior_hi = df["high"].iloc[-1 - breakout_n:-1].max()
    prior_lo = df["low"].iloc[-1 - breakout_n:-1].min()
    f["breakout"] = "up" if c.iloc[-1] > prior_hi else "down" if c.iloc[-1] < prior_lo else "-"
    e20, e50 = c.ewm(span=20, adjust=False).mean(), c.ewm(span=50, adjust=False).mean()
    f["trend"] = "up" if e20.iloc[-1] > e50.iloc[-1] else "down"
    f["rsi"] = rsi(c).iloc[-1]
    f["stop_1.5atr"] = 1.5 * a.iloc[-1]
    return f


def score(f):
    """Crude activity score 0-100: expansion in volatility, volume, a fresh breakout, trend/RSI agreement."""
    s = 0.0
    if not np.isnan(f["atr_vs_avg"]):
        s += min(max(f["atr_vs_avg"] - 1, 0), 1) * 30         # volatility expanding vs its 100-bar mean
    if not np.isnan(f["rel_volume"]):
        s += min(max(f["rel_volume"] - 1, 0), 2) / 2 * 25     # volume above recent average
    if f["breakout"] != "-":
        s += 25
        if f["breakout"] == f["trend"]:
            s += 10                                           # breakout with the trend
    if (f["trend"] == "up" and 50 < f["rsi"] < 75) or (f["trend"] == "down" and 25 < f["rsi"] < 50):
        s += 10                                               # momentum agrees, not yet stretched
    return round(s, 1)


def load_mt5(symbols, timeframe, bars):
    import MetaTrader5 as mt5
    tf = getattr(mt5, "TIMEFRAME_" + timeframe)
    if not mt5.initialize():
        raise SystemExit(f"cannot connect to MT5: {mt5.last_error()}")
    out = {}
    try:
        for s in symbols:
            mt5.symbol_select(s, True)
            r = mt5.copy_rates_from_pos(s, tf, 0, bars)
            if r is None or len(r) < 120:
                print(f"skip {s}: not enough data"); continue
            d = pd.DataFrame(r)
            d["volume"] = d["tick_volume"]
            out[s] = d
    finally:
        mt5.shutdown()
    return out


def scan(data):
    rows = []
    for name, df in data.items():
        if len(df) < 120:
            print(f"skip {name}: need >= 120 candles"); continue
        f = features(df)
        f["symbol"], f["score"] = name, score(f)
        rows.append(f)
    t = pd.DataFrame(rows)
    if t.empty:
        return t
    return t.sort_values("score", ascending=False)[
        ["symbol", "score", "price", "atr_pct", "atr_vs_avg", "rel_volume", "breakout", "trend", "rsi", "stop_1.5atr"]]


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    g = a.add_mutually_exclusive_group(required=True)
    g.add_argument("--csv", nargs="+")
    g.add_argument("--mt5", nargs="+")
    a.add_argument("--timeframe", default="M15")
    a.add_argument("--bars", type=int, default=500)
    a = a.parse_args()
    data = ({os.path.splitext(os.path.basename(p))[0]: pd.read_csv(p) for p in a.csv} if a.csv
            else load_mt5(a.mt5, a.timeframe, a.bars))
    print(scan(data).round(2).to_string(index=False))

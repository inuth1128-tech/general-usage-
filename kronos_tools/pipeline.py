"""Run the gate sequence for ONE XAU/USD trade idea, stopping at the first failed gate.

  1. news blackout     (fails closed: if the calendar can't be fetched, it stops)
  2. time machine      (bootstrap + past setups [+ Kronos paths]; must agree)
  3. budget and risk   (lot size + checks, using the most conservative simulated odds)
  4. broker dry-run    (MT5 order_check on a DEMO account, nothing sent)
  5. broker send       ONLY with --send, and you still must type yes

Kronos is run separately (needs its own setup); pass its output with --kronos-npz.
You decide side, entry, stop and target yourself; this script does not pick them.

  python pipeline.py --csv XAUUSD.csv --side long --entry 2650 --stop 2642 --target 2670 \
      --balance 5000 --kronos-npz paths.npz
"""
import argparse
import sys
from datetime import datetime, timezone
from types import SimpleNamespace

import numpy as np
import pandas as pd

import broker_mt5
import budget_risk as br
import news
import timemachine as tm
from analysis import race


def gate_news(args, fetch, now):
    if args.skip_news:
        return True, "news gate skipped by --skip-news"
    try:
        ev = news.gold_events(news.parse_events(fetch(news.CAL_URL)))
    except Exception as ex:
        return False, f"calendar unavailable ({ex}); stopping. Check a calendar by hand and use --skip-news if you accept that."
    active, nxt = news.blackout(ev, now, args.blackout_before, args.blackout_after)
    if active:
        return False, "BLACKOUT: " + ", ".join(e["title"] for e in active)
    return True, "no blackout" + (f"; next: {nxt['title']} in {(nxt['time'] - now).total_seconds() / 3600:.1f} h" if nxt else "")


def gate_sim(args, df):
    stop_pct = abs(args.entry - args.stop) / args.entry * 100
    target_pct = abs(args.target - args.entry) / args.entry * 100
    stop, target = tm.levels(args.side, stop_pct, target_pct)
    res = {}
    h, l, _ = tm.bootstrap_paths(df, args.paths, args.horizon, args.block)
    res["bootstrap"] = race(h, l, stop, target, args.side)
    sig = tm.breakout_signals(df, args.breakout_n)
    H, L = tm.historical_analogs(df, sig, args.horizon, stop_pct, target_pct, args.side)
    res["analogs"] = race(H, L, stop, target, args.side) if len(H) >= 20 else None
    if args.kronos_npz:
        z = np.load(args.kronos_npz)
        res["kronos"] = race(z["high"] / args.entry, z["low"] / args.entry, stop, target, args.side)
    ok, edges = tm.verdict(res, args.min_edge)
    live = {k: v for k, v in res.items() if v}
    return ok, edges, live


def conservative_odds(live):
    """Lowest target% and highest stop% across sources, as probabilities."""
    return (min(v["target_first_pct"] for v in live.values()) / 100,
            max(v["stop_first_pct"] for v in live.values()) / 100)


def gate_budget(args, p_t, p_s):
    s = br.size_position(args.balance, args.risk_pct, args.entry, args.stop, args.side, args.spread,
                         args.commission, args.contract, args.min_lot, args.lot_step)
    if s["lots"] == 0:
        return None, None, [("minimum lot exceeds risk budget", False)], None
    t = br.ticket(s["lots"], args.entry, args.stop, args.target, args.side, args.spread,
                  args.commission, args.contract, args.balance, args.leverage)
    ns = SimpleNamespace(daily_loss_pct=args.daily_loss_pct, daily_pnl=args.daily_pnl, min_lot=args.min_lot,
                         trades_today=args.trades_today, max_trades=args.max_trades,
                         max_margin_pct=args.max_margin_pct, min_rr=args.min_rr)
    results = br.checks(t, args.balance, args.risk_pct, ns)
    ev = br.expected_value(t, p_t, p_s)
    results.append((f"expected value positive (${ev:+.2f}, from conservative odds)", ev > 0))
    return s["lots"], t, results, ev


def run(args, mt5=None, fetch=news.fetch, ask=input, out=print, now=None):
    now = now or datetime.now(timezone.utc)
    df = pd.read_csv(args.csv)

    ok, msg = gate_news(args, fetch, now)
    out(f"[{'PASS' if ok else 'STOP'}] 1 news: {msg}")
    if not ok:
        return 1

    ok, edges, live = gate_sim(args, df)
    out(f"[{'PASS' if ok else 'STOP'}] 2 simulations: edge (target% - stop%) "
        + str({k: round(v, 1) for k, v in edges.items()}))
    if not ok:
        return 1

    p_t, p_s = conservative_odds(live)
    lots, t, results, ev = gate_budget(args, p_t, p_s)
    for name, good in results:
        out(f"      [{'PASS' if good else 'FAIL'}] {name}")
    if not all(g for _, g in results):
        out("[STOP] 3 budget/risk failed")
        return 1
    out(f"[PASS] 3 budget/risk: {lots} lots, max loss ${t['max_loss']:.2f} ({t['max_loss_pct']:.2f}%), "
        f"reward/risk {t['reward_risk']:.2f}")

    if mt5 is None:
        try:
            import MetaTrader5 as mt5
        except ImportError:
            out("[STOP] 4 broker: MetaTrader5 package not available (Windows only). Ticket above is ready to use by hand.")
            return 1
    base = ["--side", args.side, "--lots", str(lots), "--entry", str(args.entry), "--stop", str(args.stop),
            "--target", str(args.target), "--symbol", args.symbol]
    msg = broker_mt5.run(mt5, broker_mt5.parse(base + ["--dry-run"]), ask=ask, out=out)
    out(f"[{'PASS' if msg.startswith('DRY RUN') else 'STOP'}] 4 broker dry-run: {msg}")
    if not msg.startswith("DRY RUN"):
        return 1
    if not args.send:
        out("Done. Nothing sent. Re-run with --send to get the yes prompt.")
        return 0
    out(f"[....] 5 {broker_mt5.run(mt5, broker_mt5.parse(base), ask=ask, out=out)}")
    return 0


def parse(argv=None):
    a = argparse.ArgumentParser()
    a.add_argument("--csv", required=True, help="recent candles for this instrument")
    a.add_argument("--side", required=True, choices=["long", "short"])
    a.add_argument("--entry", type=float, required=True)
    a.add_argument("--stop", type=float, required=True)
    a.add_argument("--target", type=float, required=True)
    a.add_argument("--balance", type=float, required=True)
    a.add_argument("--kronos-npz", default=None)
    a.add_argument("--symbol", default="XAUUSD")
    a.add_argument("--send", action="store_true", help="after a passing dry-run, ask to send to the DEMO account")
    a.add_argument("--skip-news", action="store_true")
    a.add_argument("--blackout-before", type=int, default=30)
    a.add_argument("--blackout-after", type=int, default=30)
    a.add_argument("--paths", type=int, default=10000)
    a.add_argument("--horizon", type=int, default=48)
    a.add_argument("--block", type=int, default=8)
    a.add_argument("--breakout-n", type=int, default=20)
    a.add_argument("--min-edge", type=float, default=5.0)
    a.add_argument("--risk-pct", type=float, default=1.0)
    a.add_argument("--daily-loss-pct", type=float, default=3.0)
    a.add_argument("--daily-pnl", type=float, default=0.0)
    a.add_argument("--trades-today", type=int, default=0)
    a.add_argument("--max-trades", type=int, default=3)
    a.add_argument("--spread", type=float, default=0.30)
    a.add_argument("--commission", type=float, default=0.0)
    a.add_argument("--contract", type=float, default=100.0)
    a.add_argument("--min-lot", type=float, default=0.01)
    a.add_argument("--lot-step", type=float, default=0.01)
    a.add_argument("--leverage", type=float, default=20.0)
    a.add_argument("--max-margin-pct", type=float, default=30.0)
    a.add_argument("--min-rr", type=float, default=1.5)
    return a.parse_args(argv)


if __name__ == "__main__":
    sys.exit(run(parse()))

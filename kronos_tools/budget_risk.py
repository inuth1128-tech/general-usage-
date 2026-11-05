"""Budget + risk sizing for XAU/USD (spot gold). Pure arithmetic, never talks to a broker.

Defaults assume 1 lot = 100 oz, so a $1 move = $100 per lot. Brokers differ
(check yours: contract size, min lot, lot step, leverage) and override with flags.

  python budget_risk.py --balance 5000 --entry 2650 --stop 2642 --target 2670
  python budget_risk.py --balance 5000 --entry 2650 --stop 2642 --target 2670 \
      --daily-pnl -40 --trades-today 2 --p-target 0.35 --p-stop 0.50
"""
import argparse
import math


def size_position(balance, risk_pct, entry, stop, side, spread, commission_per_lot,
                  contract, min_lot, lot_step):
    """Lots sized so that a stop-out (price move + spread + commission) loses <= risk_pct of balance.
    Rounds DOWN to the lot step. Returns 0 lots if even the minimum lot risks more than the budget."""
    dist = (entry - stop) if side == "long" else (stop - entry)
    if dist <= 0:
        raise ValueError("stop must be on the losing side of entry")
    budget = balance * risk_pct / 100
    loss_per_lot = (dist + spread) * contract + commission_per_lot
    raw = budget / loss_per_lot
    lots = math.floor(raw / lot_step + 1e-9) * lot_step
    lots = round(lots, 8)
    return {"budget": budget, "loss_per_lot": loss_per_lot, "lots": lots if lots >= min_lot else 0.0,
            "raw_lots": raw}


def ticket(lots, entry, stop, target, side, spread, commission_per_lot, contract, balance, leverage):
    sgn = 1 if side == "long" else -1
    sd, td = abs(entry - stop), abs(target - entry)
    if (target - entry) * sgn <= 0:
        raise ValueError("target must be on the winning side of entry")
    loss = lots * ((sd + spread) * contract + commission_per_lot)
    gain = lots * ((td - spread) * contract - commission_per_lot)
    margin = lots * contract * entry / leverage
    return {"lots": lots, "ounces": lots * contract, "max_loss": loss, "max_loss_pct": loss / balance * 100,
            "gain_if_target": gain, "reward_risk": gain / loss if loss else float("nan"),
            "breakeven_win_rate_pct": loss / (loss + gain) * 100 if gain > 0 else float("nan"),
            "margin": margin, "margin_pct": margin / balance * 100}


def checks(t, balance, risk_pct, args):
    out = []
    daily_limit = balance * args.daily_loss_pct / 100
    remaining = daily_limit + args.daily_pnl          # daily_pnl negative when losing
    out.append(("lots >= min lot", t["lots"] >= args.min_lot))
    out.append((f"trades today < {args.max_trades}", args.trades_today < args.max_trades))
    out.append((f"daily loss budget left (${remaining:.2f}) covers max loss", remaining >= t["max_loss"]))
    out.append((f"margin <= {args.max_margin_pct:g}% of balance", t["margin_pct"] <= args.max_margin_pct))
    out.append((f"reward/risk >= {args.min_rr:g}", t["reward_risk"] >= args.min_rr))
    return out


def expected_value(t, p_target, p_stop):
    """EV in $ from outcome frequencies (e.g. timemachine/Kronos target% and stop%).
    Paths that hit neither are treated as $0, which ignores their small mark-to-market P&L."""
    return p_target * t["gain_if_target"] - p_stop * t["max_loss"]


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--balance", type=float, required=True)
    a.add_argument("--entry", type=float, required=True)
    a.add_argument("--stop", type=float, required=True)
    a.add_argument("--target", type=float, required=True)
    a.add_argument("--side", default="long", choices=["long", "short"])
    a.add_argument("--risk-pct", type=float, default=1.0, help="max loss per trade, %% of balance")
    a.add_argument("--daily-loss-pct", type=float, default=3.0)
    a.add_argument("--daily-pnl", type=float, default=0.0, help="today's realized P&L in $ (negative = loss)")
    a.add_argument("--trades-today", type=int, default=0)
    a.add_argument("--max-trades", type=int, default=3)
    a.add_argument("--spread", type=float, default=0.30, help="$ per oz, paid on entry/exit")
    a.add_argument("--commission", type=float, default=0.0, help="$ per lot round trip")
    a.add_argument("--contract", type=float, default=100.0, help="oz per lot")
    a.add_argument("--min-lot", type=float, default=0.01)
    a.add_argument("--lot-step", type=float, default=0.01)
    a.add_argument("--leverage", type=float, default=20.0)
    a.add_argument("--max-margin-pct", type=float, default=30.0)
    a.add_argument("--min-rr", type=float, default=1.5)
    a.add_argument("--p-target", type=float, default=None, help="prob target hit first (0-1), from simulations")
    a.add_argument("--p-stop", type=float, default=None, help="prob stop hit first (0-1)")
    a = a.parse_args()

    s = size_position(a.balance, a.risk_pct, a.entry, a.stop, a.side, a.spread, a.commission,
                      a.contract, a.min_lot, a.lot_step)
    print(f"risk budget ${s['budget']:.2f} ({a.risk_pct:g}%), loss per lot ${s['loss_per_lot']:.2f}, "
          f"raw size {s['raw_lots']:.4f} lots")
    if s["lots"] == 0:
        print(f"REJECT: min lot {a.min_lot} would risk more than the budget. Widen budget or tighten the stop.")
        return
    t = ticket(s["lots"], a.entry, a.stop, a.target, a.side, a.spread, a.commission,
               a.contract, a.balance, a.leverage)
    print(f"\nTICKET (not sent): {a.side.upper()} XAUUSD {t['lots']} lots ({t['ounces']:g} oz) @ {a.entry}"
          f"\n  stop {a.stop}  target {a.target}"
          f"\n  max loss ${t['max_loss']:.2f} ({t['max_loss_pct']:.2f}% of balance)"
          f"\n  gain at target ${t['gain_if_target']:.2f}  reward/risk {t['reward_risk']:.2f}"
          f"\n  break-even win rate {t['breakeven_win_rate_pct']:.0f}%"
          f"\n  margin ${t['margin']:.2f} ({t['margin_pct']:.0f}% of balance at 1:{a.leverage:g})")
    if a.p_target is not None and a.p_stop is not None:
        ev = expected_value(t, a.p_target, a.p_stop)
        print(f"  expected value ${ev:+.2f} per trade (from your p_target/p_stop; only as good as those inputs)")
    print("\nCHECKS")
    results = checks(t, a.balance, a.risk_pct, a)
    for name, ok in results:
        print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
    print("\nRESULT:", "all checks passed" if all(ok for _, ok in results) else "DO NOT TRADE - a check failed")


if __name__ == "__main__":
    main()

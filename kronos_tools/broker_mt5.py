"""Send ONE reviewed XAUUSD market order to a MetaTrader 5 DEMO account.

Safety rules built in (not options):
  * refuses to run unless the connected account is a DEMO account
  * prints the ticket and only sends if you type exactly: yes
  * stop loss and take profit are mandatory
  * runs mt5.order_check first; aborts on any problem

Requirements: Windows, the MT5 terminal installed and running, `pip install MetaTrader5`
(the Python package only works on Windows). Log in to the demo account in the terminal, or set
MT5_LOGIN / MT5_PASSWORD / MT5_SERVER environment variables. Never pass passwords as arguments.

  python broker_mt5.py --side long --lots 0.06 --entry 2650 --stop 2642 --target 2670
  python broker_mt5.py ... --dry-run     # order_check only, nothing sent
"""
import argparse
import os
import sys


def pick_filling(mt5, info):
    mode = info.filling_mode            # bit 1 = FOK allowed, bit 2 = IOC allowed
    if mode & 1:
        return mt5.ORDER_FILLING_FOK
    if mode & 2:
        return mt5.ORDER_FILLING_IOC
    return mt5.ORDER_FILLING_RETURN


def validate(mt5, a, info, tick):
    """Return a list of problems (empty = ok)."""
    p = []
    buy = a.side == "long"
    price = tick.ask if buy else tick.bid
    if buy and not (a.stop < price < a.target):
        p.append(f"for a long, need stop < price < target (price {price})")
    if not buy and not (a.stop > price > a.target):
        p.append(f"for a short, need stop > price > target (price {price})")
    if abs(price - a.entry) > a.max_slip:
        p.append(f"market {price} is more than ${a.max_slip} from your planned entry {a.entry}")
    if not (info.volume_min <= a.lots <= info.volume_max):
        p.append(f"lots {a.lots} outside broker range {info.volume_min}-{info.volume_max}")
    elif abs(round(a.lots / info.volume_step) * info.volume_step - a.lots) > 1e-9:
        p.append(f"lots {a.lots} not a multiple of lot step {info.volume_step}")
    if a.lots > a.max_lots:
        p.append(f"lots {a.lots} above your --max-lots cap {a.max_lots}")
    min_dist = info.trade_stops_level * info.point
    for name, lvl in (("stop", a.stop), ("target", a.target)):
        if abs(price - lvl) < min_dist:
            p.append(f"{name} closer than broker minimum distance {min_dist}")
    return p


def build_request(mt5, a, info, tick):
    buy = a.side == "long"
    return {
        "action": mt5.TRADE_ACTION_DEAL, "symbol": a.symbol, "volume": a.lots,
        "type": mt5.ORDER_TYPE_BUY if buy else mt5.ORDER_TYPE_SELL,
        "price": tick.ask if buy else tick.bid, "sl": a.stop, "tp": a.target,
        "deviation": a.deviation, "magic": a.magic, "comment": "kronos_tools",
        "type_time": mt5.ORDER_TIME_GTC, "type_filling": pick_filling(mt5, info),
    }


def run(mt5, a, ask=input, out=print):
    """Returns a short status string. mt5 and I/O are injected so the flow is testable."""
    if os.environ.get("MT5_LOGIN"):
        ok = mt5.initialize(login=int(os.environ["MT5_LOGIN"]), password=os.environ.get("MT5_PASSWORD", ""),
                            server=os.environ.get("MT5_SERVER", ""))
    else:
        ok = mt5.initialize()
    if not ok:
        return f"ABORT: cannot connect to MT5 terminal: {mt5.last_error()}"
    try:
        acc = mt5.account_info()
        if acc is None or acc.trade_mode != mt5.ACCOUNT_TRADE_MODE_DEMO:
            return "ABORT: connected account is not a DEMO account. This script never trades live accounts."
        if not mt5.symbol_select(a.symbol, True):
            return f"ABORT: symbol {a.symbol} not available (your broker may use a suffix, e.g. XAUUSDm)"
        info, tick = mt5.symbol_info(a.symbol), mt5.symbol_info_tick(a.symbol)
        if info is None or tick is None:
            return "ABORT: no quote for symbol (market closed?)"
        problems = validate(mt5, a, info, tick)
        if problems:
            return "ABORT:\n  " + "\n  ".join(problems)
        req = build_request(mt5, a, info, tick)
        chk = mt5.order_check(req)
        if chk is None or chk.retcode != 0:
            return f"ABORT: order_check failed: {getattr(chk, 'retcode', None)} {getattr(chk, 'comment', mt5.last_error())}"
        out(f"\nTICKET  DEMO account {acc.login} @ {acc.server}  balance {acc.balance}"
            f"\n  {a.side.upper()} {a.symbol} {a.lots} lots at ~{req['price']}"
            f"\n  stop {a.stop}  target {a.target}   (check margin/profit: {chk.margin} / {chk.profit})")
        if a.dry_run:
            return "DRY RUN: order_check passed, nothing sent."
        if ask("Type yes to send this order to the DEMO account: ").strip() != "yes":
            return "Cancelled. Nothing sent."
        res = mt5.order_send(req)
        if res is None or res.retcode != mt5.TRADE_RETCODE_DONE:
            return f"FAILED: {getattr(res, 'retcode', None)} {getattr(res, 'comment', mt5.last_error())}"
        return f"SENT: order {res.order} deal {res.deal} filled {res.volume} @ {res.price}"
    finally:
        mt5.shutdown()


def parse(argv=None):
    a = argparse.ArgumentParser()
    a.add_argument("--side", required=True, choices=["long", "short"])
    a.add_argument("--lots", type=float, required=True)
    a.add_argument("--entry", type=float, required=True, help="planned entry; aborts if market has moved")
    a.add_argument("--stop", type=float, required=True)
    a.add_argument("--target", type=float, required=True)
    a.add_argument("--symbol", default="XAUUSD")
    a.add_argument("--max-slip", type=float, default=1.0, help="max $ between planned entry and market")
    a.add_argument("--max-lots", type=float, default=0.5)
    a.add_argument("--deviation", type=int, default=30, help="max slippage in points")
    a.add_argument("--magic", type=int, default=20260101)
    a.add_argument("--dry-run", action="store_true")
    return a.parse_args(argv)


if __name__ == "__main__":
    try:
        import MetaTrader5 as mt5
    except ImportError:
        sys.exit("MetaTrader5 package not found (Windows only): pip install MetaTrader5")
    print(run(mt5, parse()))

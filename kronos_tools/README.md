# kronos_tools

Research scripts for a Kronos-based XAU/USD workflow, ending in a **demo-account-only** MetaTrader 5 order.
Nothing here is financial advice or a proven edge. Treat every output as an input to your own judgment.

## Status: what has and has not been run

| Script | Tested here | Not tested here |
|---|---|---|
| `analysis.py`, `timemachine.py`, `budget_risk.py`, scanner/news parsing | Yes, on synthetic data | Real market data |
| `run_kronos.py` | Syntax only | Everything involving the Kronos model (needs huggingface.co / github.com access) |
| `broker_mt5.py` | Flow tested against a fake MT5 object | A real MT5 terminal (Windows only) |
| `news.py` network fetch, `scanner.py --mt5` | No | Both need internet / a running terminal |

Expect small fixes the first time you run the untested parts.

## Setup

```
pip install numpy pandas
# Kronos (needs internet + ideally a GPU):
git clone https://github.com/shiyu-coder/Kronos
pip install -r Kronos/requirements.txt
# Orders / MT5 data (Windows, MT5 terminal installed and running):
pip install MetaTrader5
```

Data files are CSVs with columns `timestamps, open, high, low, close` (`volume`, `amount` optional).

## Workflow (run in this order)

1. **News gate** — skip trading if a blackout is active.
   `python news.py --blackout-before 30 --blackout-after 30`
2. **Scan** — see which instrument is active.
   `python scanner.py --mt5 XAUUSD XAGUSD --timeframe M15` (or `--csv a.csv b.csv`)
   Note the `stop_1.5atr` column as a starting stop distance.
3. **Kronos paths + calibration + race** — decide stop and target first, then:
   `python run_kronos.py --kronos-dir ../Kronos --csv XAUUSD.csv --stop 2642 --target 2670`
   Saves every path to `paths.npz`, prints p10–p90 coverage for the last 5 days (ideal ~80%), and how many paths hit target vs stop first.
4. **Time machine (second opinion, no Kronos)** — percent distances from entry.
   `python timemachine.py --csv XAUUSD.csv --stop-pct 0.3 --target-pct 0.75 --kronos-npz paths.npz --entry 2650`
   Prints SKIP if any source's (target% − stop%) edge is under `--min-edge` (default 5 points). Skipping on disagreement is the intended outcome of this step.
5. **Budget and risk** — size the position and run the checks.
   `python budget_risk.py --balance 5000 --entry 2650 --stop 2642 --target 2670 --p-target 0.35 --p-stop 0.5`
6. **Send to demo** — dry run first, then the real send.
   `python broker_mt5.py --side long --lots 0.06 --entry 2650 --stop 2642 --target 2670 --dry-run`
   Remove `--dry-run` to send; you must type exactly `yes`.

## What each script guarantees (and does not)

- `run_kronos.py`: `sample_count>1` in Kronos **averages** paths into one, so paths are sampled with `sample_count=1` on 1,000 copies of the input.
- Race counting (`analysis.py`): if stop and target are both touched inside one candle, order is unknown and it counts as a **stop**. Candles that reach neither level are reported as "neither".
- `timemachine.py`: assumes the stock's past distribution resembles its future. It tests how stop/target distances fare, not whether your setup predicts direction. The default setup is a 20-candle breakout; edit `breakout_signals` for your own.
- `budget_risk.py`: defaults are assumptions, not your broker's values: 1 lot = 100 oz, spread $0.30, leverage 1:20, risk 1% per trade, daily loss limit 3%, 3 trades/day. Override with flags. Sizing rounds **down**; if the minimum lot exceeds the budget it rejects the trade. Gaps and slippage can make real losses exceed the computed stop loss.
- `broker_mt5.py`: refuses any non-demo account (no override flag), requires stop and target, runs `order_check`, aborts if the market moved more than `--max-slip` from your planned entry or lots exceed `--max-lots`. Credentials come from the terminal login or `MT5_LOGIN` / `MT5_PASSWORD` / `MT5_SERVER`, never arguments. Your broker may name the symbol differently (e.g. `XAUUSDm`): use `--symbol`.
- `news.py`: calendar and headline sources are unofficial and may change or block you. If the fetch fails, check an economic calendar by hand. Headline tone is a crude keyword count.

## Files

`analysis.py` coverage + race · `run_kronos.py` Kronos sampling · `timemachine.py` bootstrap + historical analogs · `budget_risk.py` sizing + checks · `broker_mt5.py` demo order · `scanner.py` ranking · `news.py` calendar + headlines

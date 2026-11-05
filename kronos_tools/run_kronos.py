"""Sample many Kronos paths, check calibration, race paths to stop/target.

Run on a machine that can reach huggingface.co / github.com:
  git clone https://github.com/shiyu-coder/Kronos && pip install -r Kronos/requirements.txt
  python run_kronos.py --kronos-dir ./Kronos --csv data.csv --stop 98.5 --target 102

CSV columns: timestamps, open, high, low, close (volume, amount optional).
"""
import argparse, sys
import numpy as np
import pandas as pd
from analysis import coverage, race


def sample_paths(predictor, x_df, x_ts, y_ts, pred_len, n_paths, chunk, T, top_p):
    """sample_count>1 would AVERAGE paths, so use sample_count=1 on n_paths copies."""
    out = []
    for i in range(0, n_paths, chunk):
        m = min(chunk, n_paths - i)
        res = predictor.predict_batch(
            df_list=[x_df] * m, x_timestamp_list=[x_ts] * m, y_timestamp_list=[y_ts] * m,
            pred_len=pred_len, T=T, top_p=top_p, sample_count=1, verbose=False)
        out += res
    return out  # list of DataFrames


def future_ts(last_ts, freq, n):
    return pd.Series(pd.date_range(last_ts + freq, periods=n, freq=freq))


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--kronos-dir", required=True)
    a.add_argument("--csv", required=True)
    a.add_argument("--lookback", type=int, default=128)
    a.add_argument("--pred-len", type=int, default=48)
    a.add_argument("--paths", type=int, default=1000)
    a.add_argument("--chunk", type=int, default=50)
    a.add_argument("--stop", type=float, required=True)
    a.add_argument("--target", type=float, required=True)
    a.add_argument("--side", default="long", choices=["long", "short"])
    a.add_argument("--device", default=None)
    a.add_argument("--T", type=float, default=1.0)
    a.add_argument("--top-p", type=float, default=0.9)
    a.add_argument("--out", default="paths.npz")
    a = a.parse_args()

    sys.path.insert(0, a.kronos_dir)
    from model import Kronos, KronosTokenizer, KronosPredictor
    tok = KronosTokenizer.from_pretrained("NeoQuasar/Kronos-Tokenizer-base")
    mdl = Kronos.from_pretrained("NeoQuasar/Kronos-small")
    kw = {"device": a.device} if a.device else {}
    pred = KronosPredictor(mdl, tok, max_context=512, **kw)

    df = pd.read_csv(a.csv)
    df["timestamps"] = pd.to_datetime(df["timestamps"])
    cols = [c for c in ["open", "high", "low", "close", "volume", "amount"] if c in df]
    freq = df["timestamps"].diff().median()
    per_day = int(df.groupby(df["timestamps"].dt.date).size().median())

    def run_at(end):  # end = index one past the last context candle
        x = df.iloc[end - a.lookback:end]
        yts = future_ts(x["timestamps"].iloc[-1], freq, a.pred_len)
        ps = sample_paths(pred, x[cols].reset_index(drop=True), x["timestamps"].reset_index(drop=True),
                          yts, a.pred_len, a.paths, a.chunk, a.T, a.top_p)
        return np.stack([p["close"].values for p in ps]), np.stack([p["high"].values for p in ps]), \
               np.stack([p["low"].values for p in ps])

    # Step 6: calibration over the last 5 days (origins one trading day apart)
    covs = []
    for k in range(5):
        end = len(df) - a.pred_len - k * per_day
        if end - a.lookback < 0:
            break
        c, _, _ = run_at(end)
        actual = df["close"].values[end:end + a.pred_len]
        covs.append(coverage(c, actual))
        print(f"origin -{k}d: p10-p90 coverage {covs[-1]*100:.0f}% (ideal ~80%)")
    if covs:
        print(f"mean coverage {np.mean(covs)*100:.0f}% over {len(covs)} origins (small sample - weak evidence)")

    # Steps 5 + 7: forecast from the latest candles (future is unknown), race to stop/target
    c, h, l = run_at(len(df))
    np.savez(a.out, close=c, high=h, low=l)
    r = race(h, l, a.stop, a.target, a.side)
    print(f"{a.paths} paths x {a.pred_len} candles, entry~{df['close'].iloc[-1]}: {r}")


if __name__ == "__main__":
    main()

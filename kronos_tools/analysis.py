"""Model-independent analysis of simulated price paths (pure numpy)."""
import numpy as np


def coverage(close_paths: np.ndarray, actual_close: np.ndarray, lo=10, hi=90) -> float:
    """close_paths: (n_paths, horizon); actual_close: (horizon,).
    Fraction of steps where the real close fell inside the [lo, hi] percentile band.
    A well-calibrated model gives roughly (hi - lo)/100, i.e. ~0.80 for p10-p90."""
    p_lo = np.percentile(close_paths, lo, axis=0)
    p_hi = np.percentile(close_paths, hi, axis=0)
    return float(np.mean((actual_close >= p_lo) & (actual_close <= p_hi)))


def race(high_paths, low_paths, stop, target, side="long"):
    """Which level does each path touch first? high/low_paths: (n_paths, horizon).
    If both levels are touched inside the same candle the order is unknown; it is
    counted as a STOP (conservative). Returns counts and fractions."""
    if side == "long":
        hit_t, hit_s = high_paths >= target, low_paths <= stop
    else:
        hit_t, hit_s = low_paths <= target, high_paths >= stop
    h = high_paths.shape[1]
    first_t = np.where(hit_t.any(1), hit_t.argmax(1), h)
    first_s = np.where(hit_s.any(1), hit_s.argmax(1), h)
    target_first = first_t < first_s          # strictly earlier candle
    stop_first = (first_s <= first_t) & (first_s < h)
    neither = ~target_first & ~stop_first
    n = len(high_paths)
    out = {"target_first": int(target_first.sum()),
           "stop_first": int(stop_first.sum()),
           "neither": int(neither.sum())}
    out.update({k + "_pct": v / n * 100 for k, v in list(out.items())})
    return out

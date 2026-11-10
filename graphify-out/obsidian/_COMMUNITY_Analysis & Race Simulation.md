---
type: community
cohesion: 0.17
members: 24
---

# Analysis & Race Simulation

**Cohesion:** 0.17 - loosely connected
**Members:** 24 nodes

## Members
- [[Model-independent analysis of simulated price paths (pure numpy).]] - rationale - kronos_tools/analysis.py
- [[Real outcomes after each past signal (entry = signal candle's close).]] - rationale - kronos_tools/timemachine.py
- [[Resample (close return, high, low) tuples in blocks, so volatility clustering…]] - rationale - kronos_tools/timemachine.py
- [[Sample many Kronos paths, check calibration, race paths to stoptarget. Run on…]] - rationale - kronos_tools/run_kronos.py
- [[Second opinion that does NOT use Kronos replay the stock's own history. 1.…]] - rationale - kronos_tools/timemachine.py
- [[Setup = close above the highest high of the previous n candles. Replace with…]] - rationale - kronos_tools/timemachine.py
- [[Trade only if every source favors the target by at least min_edge percentage…]] - rationale - kronos_tools/timemachine.py
- [[Which level does each path touch first highlow_paths (n_paths, horizon). If…]] - rationale - kronos_tools/analysis.py
- [[analysis.py]] - code - kronos_tools/analysis.py
- [[argparse]] - concept
- [[bootstrap_paths()]] - code - kronos_tools/timemachine.py
- [[breakout_signals()]] - code - kronos_tools/timemachine.py
- [[close_paths (n_paths, horizon); actual_close (horizon,). Fraction of steps…]] - rationale - kronos_tools/analysis.py
- [[coverage()]] - code - kronos_tools/analysis.py
- [[historical_analogs()]] - code - kronos_tools/timemachine.py
- [[levels()]] - code - kronos_tools/timemachine.py
- [[main()]] - code - kronos_tools/run_kronos.py
- [[main()_1]] - code - kronos_tools/timemachine.py
- [[ndarray]] - code
- [[numpy]] - concept
- [[race()]] - code - kronos_tools/analysis.py
- [[run_kronos.py]] - code - kronos_tools/run_kronos.py
- [[timemachine.py]] - code - kronos_tools/timemachine.py
- [[verdict()]] - code - kronos_tools/timemachine.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/Analysis__Race_Simulation
SORT file.name ASC
```

## Connections to other communities
- 10 edges to [[_COMMUNITY_Scanner & Sampling]]
- 4 edges to [[_COMMUNITY_Kronos Trading README]]
- 3 edges to [[_COMMUNITY_MT5 Broker Order]]
- 2 edges to [[_COMMUNITY_News Gate]]
- 2 edges to [[_COMMUNITY_Budget & Risk Sizing]]

## Top bridge nodes
- [[argparse]] - degree 11, connects to 4 communities
- [[run_kronos.py]] - degree 12, connects to 3 communities
- [[timemachine.py]] - degree 13, connects to 2 communities
- [[numpy]] - degree 12, connects to 1 community
- [[main()_1]] - degree 10, connects to 1 community
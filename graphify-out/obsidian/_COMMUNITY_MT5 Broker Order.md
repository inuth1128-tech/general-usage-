---
type: community
cohesion: 0.21
members: 12
---

# MT5 Broker Order

**Cohesion:** 0.21 - loosely connected
**Members:** 12 nodes

## Members
- [[Return a list of problems (empty = ok).]] - rationale - kronos_tools/broker_mt5.py
- [[Returns a short status string. mt5 and IO are injected so the flow is testable.]] - rationale - kronos_tools/broker_mt5.py
- [[Send ONE reviewed XAUUSD market order to a MetaTrader 5 DEMO account. Safety…]] - rationale - kronos_tools/broker_mt5.py
- [[broker_mt5.py]] - code - kronos_tools/broker_mt5.py
- [[build_request()]] - code - kronos_tools/broker_mt5.py
- [[metatrader5]] - concept
- [[os]] - concept
- [[parse()]] - code - kronos_tools/broker_mt5.py
- [[pick_filling()]] - code - kronos_tools/broker_mt5.py
- [[run()]] - code - kronos_tools/broker_mt5.py
- [[sys]] - concept
- [[validate()]] - code - kronos_tools/broker_mt5.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/MT5_Broker_Order
SORT file.name ASC
```

## Connections to other communities
- 3 edges to [[_COMMUNITY_Analysis & Race Simulation]]
- 1 edge to [[_COMMUNITY_Scanner & Sampling]]
- 1 edge to [[_COMMUNITY_Kronos Trading README]]

## Top bridge nodes
- [[broker_mt5.py]] - degree 11, connects to 2 communities
- [[parse()]] - degree 2, connects to 1 community
- [[os]] - degree 2, connects to 1 community
- [[sys]] - degree 2, connects to 1 community
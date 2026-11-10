---
type: community
cohesion: 0.19
members: 16
---

# News Gate

**Cohesion:** 0.19 - loosely connected
**Members:** 16 nodes

## Members
- [[- list of dict(title, country, impact, time(utc aware), forecast, previous).]] - rationale - kronos_tools/news.py
- [[Events whose time - before, time + after window contains `now`; plus the next…]] - rationale - kronos_tools/news.py
- [[Gold news check scheduled high-impact USD events (blackout window) + headline…]] - rationale - kronos_tools/news.py
- [[blackout()]] - code - kronos_tools/news.py
- [[datetime]] - concept
- [[fetch()]] - code - kronos_tools/news.py
- [[gold_events()]] - code - kronos_tools/news.py
- [[json]] - concept
- [[main()_2]] - code - kronos_tools/news.py
- [[news.py]] - code - kronos_tools/news.py
- [[parse_events()]] - code - kronos_tools/news.py
- [[parse_headlines()]] - code - kronos_tools/news.py
- [[tone()]] - code - kronos_tools/news.py
- [[urllib_parse]] - concept
- [[urllib_request]] - concept
- [[xml_etree_elementtree]] - concept

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/News_Gate
SORT file.name ASC
```

## Connections to other communities
- 2 edges to [[_COMMUNITY_Analysis & Race Simulation]]
- 1 edge to [[_COMMUNITY_Kronos Trading README]]

## Top bridge nodes
- [[news.py]] - degree 15, connects to 2 communities
- [[main()_2]] - degree 8, connects to 1 community
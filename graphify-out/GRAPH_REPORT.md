# Graph Report - general-usage-  (2026-11-10)

## Corpus Check
- Corpus is ~6,287 words - fits in a single context window. You may not need a graph.

## Summary
- 186 nodes · 265 edges · 14 communities (13 shown, 1 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 4 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- package.json Dependencies
- Analysis & Race Simulation
- tsconfig.app Options
- tsconfig.node Options
- News Gate
- Scanner & Sampling
- Kronos Trading README
- MT5 Broker Order
- Budget & Risk Sizing
- Vite React Template
- Oxlint Config
- npm Scripts
- Hero Illustration
- tsconfig Root

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 18 edges
2. `compilerOptions` - 15 edges
3. `main()` - 10 edges
4. `main()` - 8 edges
5. `race()` - 7 edges
6. `main()` - 7 edges
7. `Six-step trading research workflow` - 7 edges
8. `coverage()` - 6 edges
9. `main()` - 6 edges
10. `Kronos paths, calibration and race` - 6 edges

## Surprising Connections (you probably didn't know these)
- `index.html App Entry Page` --conceptually_related_to--> `React + TypeScript + Vite Template`  [INFERRED]
  index.html → README.md
- `main()` --calls--> `coverage()`  [EXTRACTED]
  kronos_tools/run_kronos.py → kronos_tools/analysis.py
- `main()` --calls--> `race()`  [EXTRACTED]
  kronos_tools/run_kronos.py → kronos_tools/analysis.py
- `main()` --calls--> `race()`  [EXTRACTED]
  kronos_tools/timemachine.py → kronos_tools/analysis.py

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Kronos tools six-step trading research workflow** — kronos_tools_readme_news_gate, kronos_tools_readme_scan, kronos_tools_readme_calibration_race, kronos_tools_readme_time_machine, kronos_tools_readme_budget_risk, kronos_tools_readme_send_demo [EXTRACTED 1.00]
- **Vite React template tooling options** — readme_vitejs_plugin_react, readme_vitejs_plugin_react_swc, readme_react_compiler, readme_oxlint_configuration [INFERRED 0.75]

## Communities (14 total, 1 thin omitted)

### Community 0 - "package.json Dependencies"
Cohesion: 0.09
Nodes (27): dependencies, framer-motion@^14.6.0, react@^19.3.1, react-dom@^19.3.1, devDependencies, oxlint@^1.88.0, @types/node@^24.19.2, @types/react@^19.3.0 (+19 more)

### Community 1 - "Analysis & Race Simulation"
Cohesion: 0.17
Nodes (9): coverage(), race(), main(), bootstrap_paths(), breakout_signals(), historical_analogs(), levels(), main() (+1 more)

### Community 2 - "tsconfig.app Options"
Cohesion: 0.10
Nodes (19): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+11 more)

### Community 3 - "tsconfig.node Options"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 4 - "News Gate"
Cohesion: 0.19
Nodes (7): blackout(), fetch(), gold_events(), main(), parse_events(), parse_headlines(), tone()

### Community 5 - "Scanner & Sampling"
Cohesion: 0.20
Nodes (9): future_ts(), run_at(), sample_paths(), atr(), features(), load_mt5(), rsi(), scan() (+1 more)

### Community 6 - "Kronos Trading README"
Cohesion: 0.21
Nodes (14): Budget and risk step, Kronos paths, calibration and race, CSV data format, Kronos model, MetaTrader 5 (demo account only), News gate (blackout), kronos_tools Overview (Kronos XAU/USD research scripts), Race counting rule (ties count as stop) (+6 more)

### Community 7 - "MT5 Broker Order"
Cohesion: 0.21
Nodes (5): build_request(), parse(), pick_filling(), run(), validate()

### Community 8 - "Budget & Risk Sizing"
Cohesion: 0.31
Nodes (5): checks(), expected_value(), main(), size_position(), ticket()

### Community 9 - "Vite React Template"
Cohesion: 0.25
Nodes (8): index.html App Entry Page, root div mount point, src/main.tsx module entry, Oxlint Configuration, React Compiler, React + TypeScript + Vite Template, @vitejs/plugin-react (Oxc), @vitejs/plugin-react-swc (SWC)

### Community 10 - "Oxlint Config"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 11 - "npm Scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, preview

### Community 12 - "Hero Illustration"
Cohesion: 0.50
Nodes (4): Hero illustration: two stacked isometric layers, Purple-glowing bottom slab, Layered stack / abstraction layers metaphor, Outlined white top slab (wireframe style)

## Knowledge Gaps
- **9 isolated node(s):** `@vitejs/plugin-react (Oxc)`, `@vitejs/plugin-react-swc (SWC)`, `React Compiler`, `Oxlint Configuration`, `root div mount point` (+4 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 84 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `main()` connect `News Gate` to `Analysis & Race Simulation`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **What connects `@vitejs/plugin-react (Oxc)`, `@vitejs/plugin-react-swc (SWC)`, `React Compiler` to the rest of the system?**
  _9 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `package.json Dependencies` be split into smaller, more focused modules?**
  _Cohesion score 0.0907258064516129 - nodes in this community are weakly interconnected._
- **Why does `main()` connect `Analysis & Race Simulation` to `Scanner & Sampling`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Should `tsconfig.app Options` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `tsconfig.node Options` be split into smaller, more focused modules?**
  _Cohesion score 0.11764705882352941 - nodes in this community are weakly interconnected._
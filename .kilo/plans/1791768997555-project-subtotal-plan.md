# §3 主游戏维度分析 — 按主游戏汇总的小计

## Goal

In the `/briefing` detail page, chapter **3「主游戏维度分析」** the detail table
(`ProjectComboTable`) lists 主游戏 × 渠道商 rows in the default 分渠道 view but
never rolls them up per 主游戏. Add a **小计 row after each game's channel
block**, valued from the game's whole-game totals, and mirror the same row in the
Feishu/HTML export's chapter-3 table.

## Current behavior (evidence)

- Page: `superset-frontend-new/src/pages/Briefing/detail.tsx`
  - §3 section rendered at `detail.tsx:4175`, table `ProjectComboTable` at
    `detail.tsx:4211`.
  - `ProjectComboTable` (`detail.tsx:1155`) maps `projects` straight to rows;
    the 分渠道 view receives `result.projects` (game × channel, `tableRows` at
    `detail.tsx:3648`) with no per-game group.
  - Row metric values are computed inline: collapsed parent uses a `parentValues`
    literal at `detail.tsx:1316-1340`; the daily-expanded parent uses
    `totalsMetricValues(summarizeDailyRows(...))`.
  - `metricColumnDefs` / `metricCellsText` (`detail.tsx:528`,`:576`) define the
    shared column set; `TotalTag` (`detail.tsx:1531`) is the only existing
    summary marker ("合计 N 天").
- Data: backend already ships whole-game rows as `project_summary`
  (`superset/project/briefing/service.py:851`), with `prev` and `daily`; the
  chart above the table and the 不分渠道 (merged) view already use them
  (`detail.tsx:3621`, `:3654`). Channel combos arrive game-contiguous, spend-
  descending per game (`service.py:1087`), so grouping is a simple consecutive
  cut. Region rows keep the same game/channel order (`service.py:1166`).
- Export: `build_project_table` (`superset/reports/notifications/feishu.py:1079`)
  builds the chapter-3 table for both the Feishu card (`feishu.py:1530`) and the
  HTML export (`superset/project/briefing/html_export.py:337,383`).

## Decisions (confirmed with user)

1. **Form**: insert a dedicated **小计 row after each game's listed channel
   rows** — do not restructure the table into expandable groups.
2. **Value source**: the game's **whole-game totals from `project_summary`**
   (same source as the chart and the merged view). With the Top-N channel cut
   the subtotal can therefore exceed the sum of the visible channel rows; that
   is intended.
3. **Scope**: apply to **both** the page and the Feishu/HTML export.

### Derived decisions

- Subtotals show **only when 分渠道 is on** (`splitChannel === true`). When off,
  the table already lists one row per game, so a subtotal would be redundant.
- The subtotal row is a **single summary row, not expandable into days**: in
  分天 mode each channel row already expands into its own dailies, so a
  game-level daily expansion would duplicate them.
- Render the subtotal for **every game group** when 分渠道 is on (predictable,
  and correct when Top-N hides some of a game's channels even if only one is
  listed). A single-channel game may show a near-duplicate line; accepted for
  consistency.

## Changes

### 1. `superset-frontend-new/src/pages/Briefing/reportData.ts`

- Add an exported grouping helper that preserves row order and groups by 主游戏,
  e.g. `groupProjectRows<T extends { project: string }>(rows): Map<string, T[]>`
  (or reuse the existing `mediaRowsByProject`, `reportData.ts:134`). Keep it pure
  so it can be unit tested like the other helpers. Fallback for a group whose
  game is missing from `project_summary`: roll the group's rows up with
  `summarizeDailyRows` (already handles `daily`), so a legacy payload without
  `project_summary` still gets a subtotal.

### 2. `superset-frontend-new/src/pages/Briefing/detail.tsx`

- Add a prop to `ProjectComboTable`: `summaries: Map<string, ProjectRow>` (the
  game's whole-game summary row) and `showSubtotals: boolean`.
  - In the parent (`Detail`), build `summaries` with `useMemo` from
    `result.project_summary` using the **same mapping** already used for the
    merged branch (`detail.tsx:3654-3676`), so `prev` / `daily` / LTV fields are
    present. Pass `showSubtotals={splitChannel}`.
- Extract the collapsed-parent value literal (`detail.tsx:1316-1340`) into a
  small helper `projectMetricValues(p: ProjectRow): MetricValues` and reuse it
  for both the existing collapsed row and the new subtotal row (deltas computed
  from `p.prev`, same as today).
- In the render loop, replace the flat `projects.map(...)` with a walk over the
  grouped rows:
  - render each channel row exactly as today (including its 分天 disclosure
    rows),
  - after the group's rows, when `showSubtotals` and a summary exists, render a
    subtotal `<tr>`:
    - leading cell spans `leadCount` columns (`colSpan={leadCount}`), showing
      the game name plus a new `SubtotalTag` (a small "小计" chip modeled on
      `TotalTag` at `detail.tsx:1531`); give the row a `title` such as
      `"{project} 小计（全部渠道）"`,
    - metric cells from `metricCellsText(projectMetricValues(summary), ltvDays)`,
    - final status cell uses `StatusDot` with `summary.roi1` vs `breakevenLine`.
  - Style the subtotal row distinctly with palette tokens, e.g. a top border
    (`supersetPalette.outline`) and a muted background
    (`supersetPalette.bg.muted`) plus bold figures; follow
    `../Briefing/reportStyles.ts` (`briefingTable`) rather than ad-hoc CSS.
- Keys: extend the `Fragment`/row keys so the subtotal row is unique per group
  (e.g. `` `${project}-subtotal` ``).

### 3. `superset/reports/notifications/feishu.py` — `build_project_table`

- Keep selecting/sorting the channel rows as today (project name then spend
  desc, capped by `TABLE_ROW_CAPS["project"]`, `feishu.py:1084-1092`).
- Group those rows by `project` (consecutive) and, after each group, append one
  subtotal row built from `_rows_of(result, "project_summary")` for that game:
  `{"project": f"{game} 小计", "channel": "-", **_metric_cells(summary, ...)}`.
  Reuse the same `breakeven/critical` and `ltv_days`. Skip a game absent from
  `project_summary`.
- This automatically flows into the HTML export (`html_export.py:337`).
- Row-count note: the subtotal rows are additive to the existing channel cap;
  `_table` clamps `page_size` to 10 (`feishu.py:589`) and `_shrink_table_rows`
  (`feishu.py:1756`) trims when the 30 KB budget is exceeded. Accept the
  (rare) extra page rather than dropping channel detail; no change to the caps.

## Tests

- `superset-frontend-new/src/pages/Briefing/__tests__/reportData.test.ts`: add
  cases for the new grouping helper (order preserved, games contiguous, empty
  input) mirroring the existing `mediaRowsByProject` tests.
- `tests/unit_tests/reports/notifications/feishu_tests.py`:
  - Update `test_project_tables_sort_by_name_then_spend` (`feishu_tests.py:758`)
    to ignore subtotal rows (e.g. filter `project` ending in `" 小计"`) so the
    channel-row ordering assertion still holds.
  - Add a test asserting one `"{game} 小计"` row appears after each game's
    channels and that its `spend` / `roi1` match the corresponding
    `project_summary` row. The `BRIEFING_RESULT` fixture already carries
    `project_summary` and two single-channel games (`feishu_tests.py:102-123`).

## Validation

```bash
# Frontend unit tests + type/lint (run in superset-frontend-new/)
npm run test -- src/pages/Briefing/__tests__/reportData.test.ts
npm run build        # tsc --noEmit && vite build
npm run lint

# Backend export tests
pytest tests/unit_tests/reports/notifications/feishu_tests.py

# Manual
# open http://localhost:9000/briefing, chapter 3, ensure 分渠道 on:
#   - a 小计 row follows each game's channels, values equal the chart's game bar
#   - toggling 分天 keeps the 小计 as one summary row
#   - 分地区 on: still one 小计 per game, above its region rows
#   - 分渠道 off: no 小计 rows
```

## Risks / notes

- **Subtotal ≠ sum of visible rows** when Top-N cut a channel; this is the chosen
  (whole-game) semantics and should be visible in the row label ("小计" /
  "全部渠道") so it is not read as an arithmetic error.
- Region view: subtotal is per 主游戏 (across all regions/channels), matching the
  chart; ensure grouping still keys on `project` only, not `project+channel`.
- The export subtotal row carries the label in the 主游戏 column and `-` in 渠道;
  Feishu tables have no per-row background, so the text label is the only marker.

## Out of scope

- Adding subtotals to §4 媒体表现分析 or §1/§2 tables.
- Any change to the backend metric roll-up definitions or the Top-N cut.

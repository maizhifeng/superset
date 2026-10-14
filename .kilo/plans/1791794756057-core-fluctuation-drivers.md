# §1 核心指标速览 — 新增「关键指标波动」小节（可展开主次因素）

## Goal

In `/briefing` §1 核心指标速览, add a **关键指标波动** subsection: one row per
key metric whose 环比 move is material, and clicking a row reveals that move's
primary/secondary factors across three dimensions (平台 / 媒体 / 主游戏), with
each factor's signed contribution and share.

## Confirmed design (user choices)

1. **仅一级、三个维度**: every metric panel lists three parallel columns —
   平台、媒体、主游戏 — each a ranked contribution list. No second-level drill.
2. **指标范围**: the overview band's 7 tiles — 返点后消耗 / 充值流水 / 新增进入 /
   自然新增% / CPA / LTV1 / ROI1. A metric is listed when
   `|环比| ≥ 10%` (**先设 10%**, module constant, tunable later) and its
   base passes `config.baseline_thresholds` (消耗 ≥ 1万、新增 ≥ 1000；其余基数 > 0).
   Sorted by |环比| desc, `prev = 0 且 cur > 0`（新增）排最前.
3. **交互**: 折叠列表 — metric row (名称+当前值+环比) toggles a `Collapse`
   panel with the three factor columns; the top contributor is tagged 主因,
   #2–#3 次因.
4. **仅页面**: no Feishu card / HTML export changes.

## Math (backend)

Metrics mirror `_build_core_metrics` (`service.py:575-625`) exactly, so a
metric's overall value **is** the headline's value:

| metric | kind | numerator (per bucket) | denominator |
|---|---|---|---|
| spend 返点后消耗 | additive | `config.spend_column` | — |
| recharge 充值流水 | additive | `config.recharge_column` | — |
| new_users 新增进入 | additive | `config.new_users_column` | — |
| natural_rate 自然新增% | ratio | new users with `媒体 == natural_media_label` (`_natural_rate`, `service.py:506`) | new users |
| cpa | ratio | spend | new users |
| ltv1 | ratio | `config.ltv_columns[0]` | new users |
| roi1 | ratio | `config.roi_columns[0]` | spend |

All numerators reuse the same weighting rule as `_weighted_ratio`
(`service.py:471-496`): `Σ value×weight` when `*_weighted_average` else `Σ value`,
with `weight` = the denominator column. A small shared helper
(`_metric_pieces(rows, num_col, den_col, weighted)`) must make the per-item sums
reproduce `_weighted_ratio` bit-for-bit.

**Additive metrics** — per item: `contribution = cur − prev`,
`share = contribution / Δtotal` (null when Δtotal = 0).

**Ratio metrics** — per item, per bucket: `n_g`, `d_g`, `r_g = n_g/d_g`
(0 when `d_g = 0`), `w_g = d_g/Σd`. Exact two-way decomposition:

```
rate_g = w_g,prev × (r_g,cur − r_g,prev)     # 费率效应
mix_g  = (w_g,cur − w_g,prev) × r_g,cur      # 结构效应
contribution_g = rate_g + mix_g              # Σ_g contribution_g = R_cur − R_prev
```

The identity is exact (Σw = 1 per bucket), no approximation — the panel can
state 费率/结构 for the two effects.

**Ranking / trimming** — per dimension, sort items by `|contribution|` desc
(ties by name) and keep the top **K = 8**, folding the rest into one
**其他** row (aggregating `n`/`d` first for ratio metrics) so the column still
sums to the total move. `rank`: 1 → `primary`(主因), 2–3 → `secondary`(次因),
else none. Dimensions come from `config.platform_column`,
`config.ad_channel_column`, `config.project_column`; unmapped columns drop that
dimension (the panel then shows the remaining two/one).

**主游戏 axis** deliberately does **not** apply the Top-N cut or
`SCATTERED_PROJECT_LABELS` filtering — attribution must add up to the total, so
「其他/未知」等标签按原样出现（它们往往正是波动的真实来源）。

## Payload shape

New top-level key `fluctuations` (page-only; `_empty_payload` gets `[]`):

```json
{
  "key": "roi1", "label": "ROI1", "kind": "ratio",
  "current": 0.1262, "previous": 0.1077,
  "delta": 0.0185, "delta_pct": 0.1720, "new": false,
  "dimensions": [
    { "key": "platform", "label": "平台", "items": [
      { "name": "oversea", "current": 0.1316, "previous": 0.1053,
        "contribution": 0.0153, "share": 0.83,
        "rate_effect": 0.0121, "mix_effect": 0.0032,
        "rank": "primary" }
    ]}
  ]
}
```

Additive items carry `contribution`/`share`/`current`/`previous` only
(no `rate_effect`/`mix_effect`); `其他` rows carry `"name": "其他"`.

## Backend changes — `superset/project/briefing/service.py`

- New `FLUCTUATION_MIN_PCT = 0.10` constant with a comment (先设 10%，后续可提为配置).
- New `_build_fluctuations(current_df, prev_df, core, core_previous, config) -> list[dict]`:
  gate → per-dimension items → decomposition → rank/trim.
- New helpers: `_metric_pieces(...)`, `_fluctuation_metric_defs(config)`
  (metric key/label/kind/columns/base rule), `_dimension_items(...)`,
  `_decompose_ratio(...)`.
- Wire into `_build_report` (`service.py:1435-1464`) as `"fluctuations": ...`;
  `_empty_payload` (`service.py:1838-1874`) adds `"fluctuations": []`.
- No change to `_build_core_metrics` / existing payload keys; no Feishu/HTML code.

## Frontend changes — `superset-frontend-new/src/pages/Briefing/detail.tsx`

- Types: `FluctuationMetric`, `FluctuationDimension`, `FluctuationFactor`;
  `DailyReportResult.fluctuations?: FluctuationMetric[]` (near `platforms`,
  `detail.tsx:308-309`).
- New `FluctuationList` component (next to `CoreOverview`, `detail.tsx:1159`):
  - Header row per metric: label | current value (format by kind: 金额/人数/百分比/
    比率) | delta chip (▲/▼ + 环比, `消耗` neutral, `CPA` 逆指标 — reuse the
    `higherIsBetter` semantics from `CoreStatBand`, `detail.tsx:1024-1063`) |
    主因摘要 (`{name} {signed contribution}`) | chevron; row is a full-width
    `button` with `aria-expanded`, toggling a `Collapse`.
  - Panel: 3-column responsive `grid` (stack under ~900px), one column per
    dimension: title 平台/媒体/主游戏; items with name, signed contribution
    (金额/人数 用 `formatNumber`；比率用 **百分点 pp**), share%, a proportional
    bar (width = `|contribution| / max` within the column), 主因/次因 chips,
    and for ratio metrics a sub-line `费率 +1.2pp ｜ 结构 +0.3pp`.
  - Hide the whole subsection when `fluctuations` is empty.
- Render inside `<Box id="sec-core">` right after the `CoreOverview` block
  (`detail.tsx:4394-4400`), e.g. `<FluctuationList rows={result.fluctuations ?? []} />`
  with a small `subtitle1`「关键指标波动」+ caption「环比变化 ≥10% 且基数达阈值；
  点击查看平台 / 媒体 / 主游戏的主次因素」.
- Reuse existing tokens/components: `Collapse`, `ExpandMore/LessIcon`,
  `formatNumber/formatPercent`, `supersetPalette`, `TEXT_MUTED`, `DIVIDER`,
  duration/ease tokens. No new CSS files (theme tokens / MUI `sx` only).

## Tests

- New `tests/unit_tests/project/test_briefing_fluctuations.py` (same style as
  `test_briefing_project_rows.py` — pandas frames + direct service call):
  1. additive metric: contributions sum to the total delta; three dimensions
     present; 主因/次因 ranks; 其他 folds the tail and preserves the sum.
  2. ratio metric: `rate + mix` sums to `ΔR` exactly; pure-rate case (weights
     unchanged) and pure-mix case (rates unchanged); `d_g = 0` item handled.
  3. gates: 9% excluded, 11% included; base below `baseline_thresholds`
     excluded; `prev = 0, cur > 0` included with `delta_pct = null`.
  4. determinism: equal input → equal output, stable tie order; missing columns
     / empty frames → `[]`.
- Frontend: if a pure helper is extracted for the bar scaling/pp formatting, add
  a case to `src/pages/Briefing/__tests__/reportData.test.ts`; otherwise no new
  frontend unit tests (detail.tsx has none — verify via the page).

## Validation

```bash
# backend (light container has the source mounted)
docker exec -w /app superset-superset-light-1 /app/.venv/bin/python -m pytest \
  tests/unit_tests/project/test_briefing_fluctuations.py tests/unit_tests/project -q
docker exec -w /app superset-superset-light-1 /app/.venv/bin/ruff check superset/project/briefing/service.py

# frontend
npx tsc --noEmit && npm run test -- src/pages/Briefing
npx eslint src/pages/Briefing/detail.tsx && npx prettier --check src/pages/Briefing/detail.tsx

# repo standard
pre-commit run        # staged files
```

Manual: 重新运行简报 1 → 打开 `/briefing/1`，§1 出现「关键指标波动」；逐个展开
核对：平台列贡献之和（含「其他」）应等于核心指标的 Δ（例：消耗
535,709.63 − 517,932.45 = +17,777.18），并与「分业务板块」/媒体表的数字互相印证。

## Risks / notes

- **Payload size**: capped at 3 dimensions × (8 + 其他) per qualifying metric;
  typically 1–4 metrics pass the 10% gate. Page-only, so the stored result grows
  modestly (no card/export impact).
- **Ratio decomposition is exact** — 费率 + 结构 分解不是近似；文档/代码注释需写明公式与
  `d = 0 → r = 0` 约定，避免被当作四舍五入误差。
- **归因与展示口径差异**: 主游戏/媒体的展示视图有 Top-N 与长尾截断，归因列不做这些
  截断（否则加不上），这是有意为之，注释里说明。
- **周报**: 同一实现直接适用（当前周 vs 上周），文案用「环比」即可。

## Out of scope

- 飞书卡片 / HTML 导出（用户确认仅页面）。
- 二级钻取、可配置维度树、阈值提为配置项（先设常量 10%，后续可加
  `fluctuation_min_pct`）。
- 连续多期趋势型波动检测（仅做当期 vs 对比期）。

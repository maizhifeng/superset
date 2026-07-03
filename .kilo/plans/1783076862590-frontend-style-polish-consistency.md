# Frontend Style Polish & Consistency — `superset-frontend-new`

## Context

`superset-frontend-new` is a Vite + React 18 + MUI 9 (Emotion) app with a mature, token-driven theme
system but widespread token bypass in components. Two light themes exist:

- **`paper`** (default): warm terracotta primary `#b8653a`, warm paper bg `#faf7f2`, warm-brown shadows `rgba(44,36,22,…)`.
- **`notion`**: blue primary `#0075de`, neutral grays, neutral-black shadows `rgba(0,0,0,…)`.

Both share one `components.ts` override set and the same tokens shape (`bg`/`border`/`shadow`/`status`).
Layout is VS Code-style: `ActivityBar` (48px) → `SidePanel` (180px) → main → `AiDrawer`. UI text is Chinese.

A codebase audit found **~30 hardcoded shadows** and **many hardcoded colors** that bypass tokens. The
most damaging pattern: components hardcode `rgba(0,0,0,…)` shadows, so in the `paper` theme cards cast
cold black shadows instead of warm-brown ones. Lingering colors from a removed `vibrant` theme
(`#20a7c9`, `#5ac189`, `#ff7f44`, `#e0432e`) and raw Material defaults (`#d32f2f`, `#0288d1`, `#e65100`…)
appear directly in several pages. Components also branch on `isNotion ? X : Y` instead of using tokens.

## Decisions (confirmed with user)

1. **Goal:** Polish & consistency (no new aesthetic).
2. **Surface scope:** Everything visible (shell, lists, Home, Dashboard, SQL Lab, AiDrawer, AgentApp, settings/admin, shared primitives).
3. **Theme scope:** Both `paper` and `notion`.
4. **Change tolerance:** Refine within the existing aesthetic — token *values* may be tweaked subtly for a more premium feel, but no new look.

## Guiding principles

- **One source of truth:** every color/shadow/radius/spacing comes from a theme token, never a literal in component `sx`.
- **Token, not branch:** replace `isNotion ? a : b` with a token value defined per-theme in the theme files.
- **No custom CSS:** follow AGENTS.md — keep using MUI `sx` + theme overrides; prefer extending `@superset-ui-mui` primitives and the global `components.ts` overrides over duplicating card/hero styles inline.
- **Apache headers:** any new files get the ASF license header.
- **Keep tests green:** update/add unit tests for touched primitives; run typecheck + lint + tests.

---

## Tasks (ordered)

### Phase A — Token foundation (do first; everything else depends on it)

**A1. Extend the shadow scale** in both `src/theme/palette.ts` (`shadow` block) and `src/theme/notion/palette.ts`.
Add tokens to cover recurring hardcoded elevation patterns so components never inline shadow strings:
- `shadow.drawer` — edge shadow for side panels/drawers (`<±2px 0 8px>` family, currently inlined in `AiDrawer/index.tsx:376`, `SidePanel/SidePanel.tsx:60`, `DashboardFilterDrawer.tsx:136`).
- `shadow.popover` — `0 4px 16px rgba(...,0.12)` family (`AgentApp/ModelSelector.tsx:102`, `PiAgentChat.tsx:391`, `SmartInput.tsx:81`).
- `shadow.modal` — large modal elevation `0 8px 24/40px` (`CompareModal.tsx:723`, `ChartCard.tsx:469`, `DashboardNav.tsx:35`, `PickerField.tsx:434/594`).
- `shadow.snackbar` — `0 4px 12px / 0 8px 24px` (`GlobalSnackbar.tsx:43`).
- Ensure `paper` variants use warm-brown `rgba(44,36,22,…)`; `notion` variants use neutral `rgba(0,0,0,…)`.
- Keep existing tokens (`sm/md/lg/card/cardHover/focus/glow`) unchanged unless a subtle premium refinement is needed.

**A2. Add semantic accent/status tokens** to cover chart-legend, latency, and tour colors that are currently
hardcoded Material defaults. Add to both palettes (or a shared `accents` block) so per-theme mapping is possible:
- `status` already exists (`success/warning/error` + `*Bg`); add `info` + `infoBg` for parity, plus a small
  `chart` accent set (`sky/purple/pink/orange/teal/green`) to centralize `QueryHistoryList` latency colors
  and `ChartCard` legend colors (currently `#5ac189/#20a7c9/#ff7f44/#e0432e`).
- Map the recurring Material defaults to these tokens (`#d32f2f`→`error`, `#0288d1`→`info`, `#e65100`→`warning`, etc.).

**A3. Add a `backdrop` token** for overlay opacity. `components.ts` `MuiBackdrop` already sets `rgba(0,0,0,0.35)+blur`,
but components inline `0.3/0.35/0.4` (`SearchOverlay.tsx:32`, `DashboardNav.tsx:37`, `CompareModal.tsx:715`,
`ChartCard.tsx:736`). Add `shadow.backdrop`/a backdrop token and route overlays through `MuiBackdrop` overrides.

**A4. Verify palette parity** between `paper` and `notion` — every key present in one is present in the other
(notably `warning.contrastText`, `bg.*`, `border.*`, `shadow.*`, `status.*`).

### Phase B — Shadows → tokens (~30 sites)

Replace inline `boxShadow: "…rgba…"` with the matching `shadow.*` token via `var(--mui-palette-shadow-*)`
or theme path. Files & lines (evidence from audit):

- `components/AccentCard.tsx:36`
- `components/AiDrawer/index.tsx:376`, `InsightContent.tsx:165`, `StreamingMessage.tsx:24`, `KnowledgeCards.tsx:43`, `MessageBubble.tsx:152`, `SmartInput.tsx:81`
- `components/SidePanel/SidePanel.tsx:60`
- `components/PageLoading.tsx:34`
- `components/GlobalSnackbar.tsx:43`
- `components/ResponsiveDataGrid.tsx:159`
- `components/AgentApp/AgentStepCard.tsx:77`, `ModelSelector.tsx:102`, `PiAgentChat.tsx:391`
- `components/DashboardFilter/DashboardFilterDrawer.tsx:136`
- `pages/Dashboard/DashboardGrid.tsx:93`, `DashboardList/index.tsx:146/155`, `DashboardNav.tsx:34`, `CompareModal.tsx:723`, `ChartCard.tsx:459/468`
- `pages/DatabaseDetail/index.tsx:117/284`
- `pages/Settings/index.tsx:26`
- `pages/ChartCreation/PickerField.tsx:373/433/594`
- `superset-ui-mui/components/EmptyState/index.tsx:23`
- `components/TourGuide.tsx:273`

For `boxShadow: <number>` usages (e.g. `DashboardList:246/266`, `DashboardGrid:135`, `CompareModal:225/260`,
`ChartCard:753`, `PiAgentChat:798`) evaluate case-by-case: keep MUI elevation numbers only where they match
the intended token; otherwise switch to the token.

### Phase C — Colors → tokens

- **`pages/Dashboard/CompareModal.tsx`** (heavy): replace `#e3f2fd/#bbdefb/#90caf9/#f5f5f5/#e0e0e0/#fafafa/#d32f2f/#0288d1/#e65100` and the dashed-border badge colors (`:862/887/893/920/926/942/946/1041/1079`) with `primary/info/error/warning` containers + tokens. This file needs the most attention.
- **`components/TourGuide.tsx`**: step color map (`:30-52`, `:453-457`, `:521`) → centralized accent/status tokens.
- **`pages/QueryHistoryList/index.tsx:30-33`**: latency color ramp → `status.*` tokens.
- **`pages/Dashboard/ChartCard.tsx:34-38`** & **`pages/DashboardList/index.tsx`** & **`components/DataGridTable.tsx:54-83`**: remove lingering `vibrant`-theme fallbacks (`#20a7c9`/`#5ac189`/`#ff7f44`/`#e0432e` and `var(--mui-palette-primary-main, #20a7c9)`) → real palette tokens / new `chart` accent tokens. (Fallbacks inside `var(..., #x)` are harmless at runtime but misleading; clean them.)
- **`pages/Login/index.tsx`**: purple gradients (`rgba(86,69,212,…)` `:85-105/118/132`, `#5645d4` `:178/193`) → `notion` secondary/purple accent token; align paper-theme gradients (`rgba(184,101,58,…)`/`rgba(201,160,74,…)` `:90/91/148/161/193`) to tokens.
- **`components/AgentApp/PiAgentChat.tsx:346-406/599/654/660`**: teal `rgba(0,122,115,…)` avatar/button accents and `#1976d2/#9c27b0` avatar colors → tokens.
- **`pages/ChartCreation/ChartTypeSelector.tsx:85/117`** & **`PickerField.tsx:95/153/373`**: `rgba(32,167,201,…)`/`rgba(211,47,47,…)` → `primary`/`error` tokens.
- **`pages/SqlLab/index.tsx:60/63`**: keep CSS-var-based values (they already reference tokens) — only normalize the inline `rgba(0,0,0,0.12)` fallbacks to match palette.

### Phase D — Remove `isNotion` branching

Replace manual theme conditionals with token-driven values (define the differing value in the theme files, not in the component):
- **`pages/DashboardList/index.tsx`** (`isNotion` shadow branches `:146/151/155/158/160`) — now solved by Phase B shadow tokens.
- **`pages/Login/index.tsx`** (`isNotion` gradient `:178`) — centralize into a per-theme `hero`/gradient token if kept, or unify to one token-driven gradient.
- **`pages/Dashboard/ChartCard.tsx`** (`isCompareActive`/`isNotion` branches `:459-469`) — tokenize elevation.
If a genuine theme-specific visual must remain, move it into the theme palette rather than branching in JSX.

### Phase E — Standardize recurring patterns

- **Card pattern:** converge `AccentCard`, `EmptyState`, `DatabaseDetail` Papers (`:117/284`), `Settings` card (`:26`), `PageLoading` onto the global `MuiCard` override (which already defines border/radius/shadow/hover-lift). Remove duplicated hover-shadow code; if a shared card primitive is warranted, extend `@superset-ui-mui/components` rather than duplicating `sx`.
- **Home accent colors:** `pages/Home/index.tsx` defines a per-card `color` (`:17-23`) but passes `color="text.secondary"` to icons (`:36`) — wire the accent colors through (via tokens) or drop the unused field.
- **Edge shadows:** unify drawer/panel edge shadows to `shadow.drawer`.
- **Backdrops:** route all overlays through `MuiBackdrop` override + `backdrop` token.

### Phase F — Polish (within aesthetic)

- Card hover: ensure `AccentCard` and list cards match the global lift (`translateY(-1px)` + `shadow.cardHover`).
- Focus rings: `index.css` defines paper/notion `focus-visible` rings; ensure custom interactive elements (ActivityBar items, clickable cards, nav items) use them consistently.
- Spacing rhythm: standardize page padding (`p: 3` vs ad-hoc) and card padding to the `spacing` scale.
- Subtle token refinement allowed (shadow ramps, hover deltas) — keep changes minimal and theme-consistent.

### Phase G — Verification

1. `cd superset-frontend-new && npm run type` (tsc --noEmit).
2. `npm run lint` (eslint src).
3. `npm run test` (vitest) — update snapshots/expectations for touched primitives.
4. `npm run build` (tsc + vite build).
5. Visual check both themes: `npm run dev` (port 9000), toggle `paper`↔`notion`, inspect Home, DashboardList, Dashboard (incl. Compare modal), SqlLab, AiDrawer, AgentApp, Settings.
6. Run pre-commit on changed files (`pre-commit run` after `git add`); activate the venv first if needed.
7. Confirm no regressions in existing component tests (`PageHeader`, `TableSkeleton`, `FilterBar`, `DataPreviewTable`, `GlobalSnackbar`, `ListPageLayout`, `ProtectedRoute`, `ChatInput`).

---

## Risks

- **`CompareModal.tsx` color rewrite is large** and behavior-sensitive (highlight states, sticky rows). Verify each color mapping preserves the intended primary/secondary/intra distinction; keep a side-by-side diff.
- **Removing `isNotion` branches** could shift the `notion` theme look if a token doesn't exist for the differing value — ensure Phase A adds the token first.
- **`paper` shadow warmth:** switching cold `rgba(0,0,0,…)` → warm tokens changes the `paper` feel visibly (intended, within tolerance) — confirm it reads as premium, not muddy.
- **CSS-var fallback cleanup** (`var(--…, #20a7c9)`) must keep a valid fallback or none; don't leave empty fallbacks.

## Out of scope

- Dark mode (separate effort).
- New aesthetic / DESIGN.md sticker-palette & hero-band implementation (separate effort).
- Adding a third theme.
- Cypress/E2E migrations.

## Open questions for implementation

- Whether to introduce a shared `Card` primitive in `@superset-ui-mui` or keep relying on the global `MuiCard` override (recommend: extend override first, add primitive only if duplication persists).
- Whether `Login`'s purple gradient should become a `notion`-only accent token or be unified to the existing palette (recommend: unify to a token-driven gradient, drop the purple).

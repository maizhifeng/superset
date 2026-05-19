---
name: Apache Superset
colors:
  primary: "#20a7c9"
  primaryLight: "#5fc4df"
  primaryDark: "#1589a6"
  primaryContainer: "#d4f0f7"
  primaryOnContainer: "#0a4b5c"
  secondary: "#444444"
  secondaryLight: "#666666"
  secondaryContainer: "#e8e8e8"
  error: "#e0432e"
  errorContainer: "#fce9e9"
  warning: "#ff7f44"
  success: "#5ac189"
  successContainer: "#e6f4ea"
  info: "#66bcfe"
  surface: "#ffffff"
  surfaceVariant: "#f0f4f5"
  bgPage: "#f5f5f5"
  bgSidebar: "#f8f9fa"
  bgHeader: "#f0f4f5"
  textPrimary: "#1a1a1a"
  textSecondary: "#5f6368"
  textDisabled: "#9aa0a6"
  divider: "#e0e0e0"
  outline: "#dadce0"
typography:
  h1:
    fontFamily: Inter
    fontSize: 2rem
    fontWeight: 600
    lineHeight: 1.3
  h2:
    fontFamily: Inter
    fontSize: 1.75rem
    fontWeight: 600
    lineHeight: 1.35
  h3:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: 500
    lineHeight: 1.4
  h4:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: 500
    lineHeight: 1.4
  h5:
    fontFamily: Inter
    fontSize: 1.1rem
    fontWeight: 500
    lineHeight: 1.45
  h6:
    fontFamily: Inter
    fontSize: 1rem
    fontWeight: 500
    lineHeight: 1.5
  body:
    fontFamily: Inter
    fontSize: 0.875rem
    lineHeight: 1.5
  bodySmall:
    fontFamily: Inter
    fontSize: 0.8125rem
    lineHeight: 1.5
  caption:
    fontFamily: Inter
    fontSize: 0.75rem
    lineHeight: 1.5
  button:
    fontFamily: Inter
    fontWeight: 500
    textTransform: none
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  xl: 16px
spacing:
  1: 4px
  2: 8px
  3: 12px
  4: 16px
  6: 24px
  8: 32px
motion:
  duration:
    micro: 80ms
    quick: 150ms
    standard: 200ms
    slow: 300ms
    slower: 400ms
  easing:
    standard: cubic-bezier(0.2, 0, 0, 1)
    decelerate: cubic-bezier(0, 0, 0.2, 1)
    accelerate: cubic-bezier(0.3, 0, 1, 1)
    emphasized: cubic-bezier(0.3, 0, 0, 1)
    snappy: cubic-bezier(0.3, 0, 0.1, 1)
---

## Overview

Light-themed data visualization platform with teal primary, clean card-based layouts, and developer-first workflows. The interface prioritizes data clarity — charts, tables, and metrics are the heroes. Navigation stays minimal with a top bar, and cards organize content in responsive grids. Inspired by modern cloud platforms but purpose-built for analytical dashboards.

## Colors

- **Primary (#20a7c9):** Teal — the single interaction driver. Used for buttons, links, active tabs, focus rings, and key accents.
- **PrimaryLight (#5fc4df):** Hover, lighter fills, and decorative accents.
- **PrimaryDark (#1589a6):** Pushed states, active press, and deeper accents.
- **PrimaryContainer (#d4f0f7):** Background fills for primary-tagged elements (chips, badges, alert backgrounds).
- **Secondary (#444444):** Secondary actions, neutral buttons, and non-primary UI.
- **Error (#e0432e):** Destructive actions, error states, and deletion.
- **Warning (#ff7f44):** Cautionary states, thresholds, and pending states.
- **Success (#5ac189):** Positive states, healthy indicators, and confirmations.
- **Surface (#ffffff):** Card backgrounds, paper surfaces, and panels.
- **SurfaceVariant (#f0f4f5):** Table headers, section backgrounds, subtle panel fills.
- **BgPage (#f5f5f5):** Page-level background, outside cards.
- **BgSidebar (#f8f9fa):** Sidebar/drawer backgrounds.
- **TextPrimary (#1a1a1a):** Headings, body text, high-emphasis content.
- **TextSecondary (#5f6368):** Labels, metadata, captions — medium emphasis.
- **TextDisabled (#9aa0a6):** Disabled text, placeholders.
- **Divider (#e0e0e0):** Borders, horizontal rules, table cell borders.

### Usage rules

- Use `primary.main` for primary actions, `primary.light` for hover, `primary.dark` for pressed.
- Use `text.secondary` for labels and metadata; reserve `text.primary` for headings and body.
- Use `background.default` for page backdrop, `background.paper` for cards and surfaces.
- Error/warning/success containers are for background fills only — pair with their matching `onContainer` or `main` text.

## Typography

The system uses Inter for all roles — UI, display, and data labels. No secondary font. All nine weights (100–900) are available.

| Style | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| h1 | 2rem | 600 | 1.3 | Page titles, dashboard name |
| h2 | 1.75rem | 600 | 1.35 | Section headings |
| h3 | 1.5rem | 500 | 1.4 | Card titles, modal titles |
| h4 | 1.25rem | 500 | 1.4 | Chart titles, panel headings |
| h5 | 1.1rem | 500 | 1.45 | Subsection titles |
| h6 | 1rem | 500 | 1.5 | Group labels |
| body | 0.875rem | 400 | 1.5 | Body text, table cells |
| bodySmall | 0.8125rem | 400 | 1.5 | Denser tables, metadata |
| caption | 0.75rem | 400 | 1.5 | Timestamps, footnotes |
| button | — | 500 | — | Buttons (textTransform: none) |

### Usage rules

- Button text must use `textTransform: "none"` — no all-caps.
- Body (0.875rem) is the default for all content. Only use bodySmall (0.8125rem) for dense data tables where space is constrained.

## Shape & Spacing

All spacing follows a 4/8/12/16/24/32px scale. The 8px grid is the fundamental rhythm — most margins and padding land on multiples of 8.

### Border radius

| Scale | Value | Usage |
|-------|-------|-------|
| sm | 4px | Chips, badges, tooltips |
| md | 8px | Buttons, inputs, selects, alerts, skeleton |
| lg | 12px | Cards, dialogs, dropdowns, menus |
| xl | 16px | Large modals, bottom sheets |

### Component-specific shapes

- Cards: `borderRadius: "12px"` (lg), no border, use shadow for separation
- Buttons: `borderRadius: "8px"` (md)
- Inputs: `borderRadius: "8px"` (md)
- Dialogs: `borderRadius: "12px"` (lg)
- Skeleton: `borderRadius: "6px"` (between sm and md)

## Elevation & Shadow

Shadows provide depth without relying on borders. Cards use shadows instead of strokes.

| Scale | Value | Usage |
|-------|-------|-------|
| sm | `0 1px 3px rgba(0,0,0,0.08)` | Default cards, subtle separation |
| md | `0 4px 8px rgba(0,0,0,0.12)` | Elevated cards, dropdowns, menus |
| lg | `0 8px 24px rgba(0,0,0,0.12)` | Modals, drawers, floating elements |
| card | same as sm | Cards in grid layout |
| cardHover | same as md | Card hover state |

## Motion

Animations are functional — they communicate state changes, not decorate. Prefer quick (150ms) for micro-interactions and standard (200ms) for transitions.

### Duration

| Token | ms | Usage |
|-------|----|-------|
| micro | 80ms | Instant feedback, scale transforms on press |
| quick | 150ms | Button hovers, input focus, color transitions |
| standard | 200ms | Card hover, sheet slides, dialog open/close |
| slow | 300ms | Page transitions, skeleton loading |
| slower | 400ms | Emphasized transitions, onboarding |

### Easing

| Token | Curve | Usage |
|-------|-------|-------|
| standard | `cubic-bezier(0.2, 0, 0, 1)` | Default — openness, no bounce |
| decelerate | `cubic-bezier(0, 0, 0.2, 1)` | Elements entering view (cards, sheets) |
| accelerate | `cubic-bezier(0.3, 0, 1, 1)` | Elements leaving view |
| emphasized | `cubic-bezier(0.3, 0, 0, 1)` | Dialog open/close, important transitions |
| snappy | `cubic-bezier(0.3, 0, 0.1, 1)` | Micro-interactions, press feedback |

### Usage rules

- Use quick + standard easing for hover and focus transitions: `transition: "background-color 150ms cubic-bezier(0.2, 0, 0, 1)"`
- Cards: `transition: "box-shadow 200ms cubic-bezier(0, 0, 0.2, 1), transform 200ms cubic-bezier(0, 0, 0.2, 1)"`
- IconButton: scale up on hover (1.08), scale down on press (0.95) — both at micro duration
- Dialog: use emphasized easing for open/close
- Reduced motion: honor `prefers-reduced-motion` — disable all transform-based animations, keep opacity-only

## Components

### Button

| Property | Value |
|----------|-------|
| Shape | rounded (8px) |
| Font | body size (0.875rem), weight 500, no uppercase |
| Padding | small: 4px 10px, medium: 6px 16px, large: 10px 24px |
| Elevation | none (flat), hover shadow for contained variant |
| Transition | background-color + box-shadow, 150ms, standard ease |

States:
- **Default**: contained uses `primary.main`, outlined uses `borderColor: #d0d0d0`, text uses transparent bg
- **Hover**: contained adds shadow-md, outlined gets `backgroundColor: rgba(0,0,0,0.04)`, text gets `rgba(32,167,201,0.08)`
- **Pressed**: contained shifts to `primary.dark`, outlined/text use standard darkening
- **Disabled**: MUI default disabled opacity

### Card

| Property | Value |
|----------|-------|
| Shape | rounded (12px) |
| Border | none (shadow for separation) |
| Shadow | sm (default), md (hover) |
| Transition | box-shadow + transform, 200ms, decelerate ease |
| Hover | translateY(-1px) |

Cards are the primary container for charts, tables, and metric summaries. Never use borders on cards — rely on shadow.

### Dialog (Modal)

| Property | Value |
|----------|-------|
| Shape | rounded (12px) |
| Header padding | 24px 24px 8px |
| Content padding | 8px 24px 16px |
| Actions padding | 8px 24px 24px |

### AppBar (Top Nav)

| Property | Value |
|----------|-------|
| Background | #ffffff |
| Bottom border | 1px solid #e0e0e0 |
| Elevation | none |
| Text color | #1a1a1a |

### Table

| Element | Detail |
|---------|--------|
| Header | fontWeight 600, bg #f0f4f5, borderBottom 1px solid #e0e0e0 |
| Body | fontSize 0.875rem, borderBottom rgba(0,0,0,0.06) |

### Input

| Property | Value |
|----------|-------|
| Shape | rounded (8px) |
| Focus border | 2px solid primary.main (#20a7c9) |
| Transition | border-color + box-shadow, 150ms, standard ease |

### Tab

| Property | Value |
|----------|-------|
| Text | weight 500, no uppercase |
| Selected color | primary.main (#20a7c9) |
| Indicator color | primary.main (#20a7c9) |
| Transition | color, 150ms, standard ease |

### Toggle (Switch)

| Property | Value |
|----------|-------|
| Transition | transform, 150ms, standard ease |

### IconButton

| Property | Value |
|----------|-------|
| Hover | bg rgba(0,0,0,0.04), scale 1.08 |
| Press | scale 0.95 |
| Transition | bg + transform, 150ms, standard ease |

### Chip

| Property | Value |
|----------|-------|
| Font | weight 500 |

### Tooltip

| Property | Value |
|----------|-------|
| Shape | rounded (6px) |
| Font | 0.75rem |

### Skeleton

| Property | Value |
|----------|-------|
| Shape | rounded (6px) |

## Layout

- **Navigation**: top bar only (MuiAppBar). No sidebar in default state. Sidebar/drawer is reserved for filter panels and opens on demand.
- **Content grid**: Cards arranged in responsive grid. On mobile (<600px), cards stack full-width. On tablet/desktop, use configurable column counts (defaults to 2–4 columns).
- **Page background**: #f5f5f5 (bgPage). Cards sit on white (#ffffff) surfaces separated by shadows.
- **Header area**: #f0f4f5 (bgHeader) for table headers and section backdrops.

## Do's and Don'ts

### Do
- Prefer semantic tokens via `sx` prop: use `"primary.main"`, `"text.secondary"`, `"background.paper"` — never hardcode hex values
- Use `Box` and `Typography` from MUI for layout — avoid custom divs with manual styling
- Cards should use shadow for depth, not borders
- Use `body` (0.875rem) as the default text size everywhere
- Keep animation durations within the defined scale — prefer quick (150ms) for micro-interactions

### Don't
- Don't use `textTransform: "uppercase"` on buttons — buttons must not be all-caps
- Don't add borders to cards — use `boxShadow` for separation
- Don't hardcode colors — reference theme tokens by path
- Don't use custom CSS files for layout — use `sx` prop on MUI components
- Don't exceed the spacing scale — use tokens from the 4/8/12/16/24/32 scale, not arbitrary values
- Don't add decorative animations — motion must communicate state changes

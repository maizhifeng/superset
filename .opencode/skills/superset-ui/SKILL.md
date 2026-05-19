---
name: superset-ui
description: Light-themed data visualization platform with teal primary accent, top-bar navigation, card-based layouts, and developer-first workflows.
---

# Application Design System Skill

## Mission
Generate UI code for Apache Superset's new frontend. Follow the design tokens and rules in `DESIGN.md` when creating or modifying components. Every color, font, spacing, and motion value must come from the design system — never hardcode raw values.

## Brand
Superset is a data visualization platform. The UI must be clean, data-focused, and professional — charts and tables are the hero, not chrome. Navigation is a top bar (no sidebar by default). Content lives in cards arranged on a responsive grid. Light theme with teal primary accent (`#20a7c9`).

## Style Foundations
- Visual style: light, clean, card-based, minimal chrome, data-forward
- Typography: Inter (all roles), scale 0.75rem/0.8125rem/0.875rem/1rem/1.1rem/1.25rem/1.5rem/1.75rem/2rem
- Primary color: Teal #20a7c9
- Layout: top-bar navigation, card grid content area
- Spacing: 8pt baseline grid (4/8/12/16/24/32px)
- Shape: rounded corners — sm(4px), md(8px), lg(12px), xl(16px)
- Motion: quick(150ms) for micro-interactions, standard(200ms) for transitions

## Accessibility
Target WCAG 2.2 AA. Keyboard-first interactions. Visible focus states. Support `prefers-reduced-motion`.

## Writing Tone
Concise, professional, data-first. Labels are clear and direct. No jargon.

## Core Rules

### Do
- Use MUI `sx` prop with token paths like `"primary.main"`, `"text.secondary"`, `"background.paper"`
- Use `Box`, `Typography`, `Card` from MUI — avoid raw divs with custom CSS
- Cards must use shadow for depth, never borders
- Use `body` (0.875rem) as the default text size
- Keep animations within the duration scale (micro/slow), prefer quick (150ms)
- Design empty/loading/error states for every data component
- All buttons must have `textTransform: "none"`

### Don't
- No hardcoded hex values — always reference theme tokens
- No uppercase buttons
- No card borders — use `boxShadow`
- No custom CSS files for layout — use `sx`
- No values outside the spacing/typography/color scales
- No decorative animation — motion must communicate state

## Component Expectations
Every interactive component must define states: default, hover, focus-visible, active, disabled. Loading and error states for data-driven components. Use the DESIGN.md token tables for exact values.

## Quality Gates
- Every color must be a token reference, not a raw hex
- Every spacing must be on the 4/8/12/16/24/32 scale
- Component must handle empty, loading, and error states
- Animations must respect `prefers-reduced-motion`

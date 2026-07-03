---
version: alpha
name: Notion-design-analysis
description: Warm minimalism, serif headings, soft surfaces. A single confident blue primary, deep-indigo hero band, and a playful multi-colour sticker palette.

colors:
 primary: "#0075de"
 primary-pressed: "#005bab"
 on-primary: "#ffffff"
 secondary: "#213183"
 ink: "#000000"
 ink-secondary: "#31302e"
 ink-muted: "#615d59"
 ink-faint: "#a39e98"
 canvas: "#ffffff"
 canvas-soft: "#f6f5f4"
 hairline: "#e6e6e6"
 accent-sky: "#62aef0"
 accent-purple: "#d6b6f6"
 accent-pink: "#ff64c8"
 accent-orange: "#dd5b00"
 accent-teal: "#2a9d99"
 accent-green: "#1aae39"
 accent-brown: "#523410"
 semantic-success: "#1aae39"
 semantic-warning: "#dd5b00"
 semantic-error: "#e03131"

typography:
 display-1:
   fontFamily: Notion, Inter, system-ui, sans-serif
   fontSize: 64px
   fontWeight: 700
   lineHeight: 1.0
   letterSpacing: -2.125px
 display-2:
   fontFamily: Notion, Inter, system-ui, sans-serif
   fontSize: 54px
   fontWeight: 700
   lineHeight: 1.04
   letterSpacing: -1.875px
 heading-1:
   fontFamily: Notion, Inter, system-ui, sans-serif
   fontSize: 40px
   fontWeight: 700
   lineHeight: 1.1
   letterSpacing: -1px
 heading-2:
   fontFamily: Notion, Inter, system-ui, sans-serif
   fontSize: 26px
   fontWeight: 700
   lineHeight: 1.23
   letterSpacing: -0.625px
 heading-3:
   fontFamily: Notion, Inter, system-ui, sans-serif
   fontSize: 22px
   fontWeight: 700
   lineHeight: 1.27
   letterSpacing: -0.25px
 title:
   fontFamily: Notion, Inter, system-ui, sans-serif
   fontSize: 20px
   fontWeight: 600
   lineHeight: 1.4
   letterSpacing: -0.125px
 body-md:
   fontFamily: Notion, Inter, system-ui, sans-serif
   fontSize: 16px
   fontWeight: 400
   lineHeight: 1.5
 body-sm:
   fontFamily: Notion, Inter, system-ui, sans-serif
   fontSize: 15px
   fontWeight: 400
   lineHeight: 1.33
 button:
   fontFamily: Notion, Inter, system-ui, sans-serif
   fontSize: 16px
   fontWeight: 500
   lineHeight: 1.5
 caption:
   fontFamily: Notion, Inter, system-ui, sans-serif
   fontSize: 14px
   fontWeight: 400
   lineHeight: 1.43
 eyebrow:
   fontFamily: Notion, Inter, system-ui, sans-serif
   fontSize: 12px
   fontWeight: 600
   lineHeight: 1.33
   letterSpacing: 0.125px

rounded:
 xs: 4px
 sm: 5px
 md: 8px
 lg: 12px
 xl: 16px
 full: 9999px

spacing:
 xxs: 4px
 xs: 8px
 sm: 12px
 md: 16px
 lg: 24px
 xl: 28px
 xxl: 32px
 section: 64px

components:
 button-primary:
   backgroundColor: "{colors.primary}"
   textColor: "{colors.on-primary}"
   typography: "{typography.button}"
   rounded: "{rounded.md}"
   padding: "10px 18px"
 button-primary-pressed:
   backgroundColor: "{colors.primary-pressed}"
   textColor: "{colors.on-primary}"
 button-secondary:
   backgroundColor: "transparent"
   textColor: "{colors.ink}"
   typography: "{typography.button}"
   rounded: "{rounded.full}"
   padding: "10px 20px"
   border: "1px solid {colors.hairline}"
 button-dark:
   backgroundColor: "{colors.ink}"
   textColor: "{colors.canvas}"
   typography: "{typography.button}"
   rounded: "{rounded.full}"
   padding: "10px 20px"
 card-feature:
   backgroundColor: "{colors.canvas}"
   textColor: "{colors.ink}"
   rounded: "{rounded.lg}"
   padding: "{spacing.lg}"
   border: "1px solid {colors.hairline}"
 dark-hero-band:
   backgroundColor: "{colors.secondary}"
   textColor: "{colors.canvas}"
   padding: "{spacing.section}"
 text-input:
   backgroundColor: "{colors.canvas}"
   textColor: "{colors.ink}"
   typography: "{typography.body-md}"
   rounded: "{rounded.xs}"
   padding: "{spacing.sm} {spacing.md}"
   border: "1px solid {colors.hairline}"
   height: 44px
 badge-pill:
   backgroundColor: "{colors.primary}"
   textColor: "{colors.on-primary}"
   typography: "{typography.eyebrow}"
   rounded: "{rounded.full}"
   padding: "4px 12px"

---

## Overview

Notion takes all-in-one workspace as its base, then sharpens it through warm minimalism, serif headings, soft surfaces. An off-white canvas under near-black type, structured by a single confident blue. A playful multi-colour sticker palette carries the personality while the chrome stays quiet — with one inverted deep-indigo hero band.

## Colors

### Brand & Primary
- **Blue** (#0075de): Primary CTA, links, active signal.
- **Deep Indigo** (#213183): Hero "night" band.

### Accents (Sticker Palette)
- Sky (#62aef0), Purple (#d6b6f6), Pink (#ff64c8), Orange (#dd5b00), Teal (#2a9d99), Green (#1aae39), Brown (#523410)

### Surface
- **Canvas** (#ffffff): Page background. **Canvas-soft** (#f6f5f4): Warm paper page canvas.

## Rounded
- **4px** (xs): Form fields. **8px** (md): Utility buttons. **12px** (lg): Content cards. **9999px** (full): Pill marketing CTAs and badges.

## Components

### Buttons
- **button-primary** — Blue (#0075de), 10px 18px padding, 8px rounded (rectangular, not pill).
- **button-secondary** — White, transparent fill, 9999px pill shape, hairline border.
- **button-dark** — Black, 9999px pill for dark hero bands.

### Cards
- **card-feature** — White, 1px hairline border, 12px rounded, 24px padding.

### Inputs
- **text-input** — White, 44px height, 1px hairline border, 4px rounded.

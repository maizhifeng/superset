/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * WASD control hint for wide briefing tables.
 *
 * The wide 主游戏 × 渠道商 detail table is a scroll viewport; with the pointer
 * resting on it, W/A/S/D scroll the view (up/left/down/right) so the reader
 * does not have to leave the keyboard for the scrollbars.
 *
 * Only the keycaps are drawn — the canvas stays transparent so the table shows
 * through.  Each keycap carries its direction arrow and letter, and a held key
 * fills with the primary color (white glyphs on it).
 *
 * There is no idle looping demo: the highlight reflects real key presses only.
 * It is plain React state instead of CSS animation, so it also works on
 * Windows with "animation effects" disabled — that reports
 * ``prefers-reduced-motion: reduce``, which collapses the theme's CSS
 * keyframes to nothing.
 */

import Box from "@mui/material/Box";
import { BRIEFING_CSS_COLORS } from "./reportStyles";

const KEY_WIDTH = 40;
const KEY_HEIGHT = 44;
const KEY_RADIUS = 8;

type Direction = "up" | "left" | "down" | "right";

type Keycap = {
  id: string;
  label: string;
  direction: Direction;
  x: number;
  y: number;
};

/**
 * W on top, A/S/D below, in a 136×94 viewBox.  Large enough to read at a
 * glance and to hold both the direction arrow and the letter comfortably.
 */
const KEYCAPS: Keycap[] = [
  { id: "w", label: "W", direction: "up", x: 48, y: 1 },
  { id: "a", label: "A", direction: "left", x: 1, y: 49 },
  { id: "s", label: "S", direction: "down", x: 48, y: 49 },
  { id: "d", label: "D", direction: "right", x: 95, y: 49 },
];

/** Chevron pointing in the key's scroll direction. */
function directionArrow(direction: Direction, x: number, y: number): string {
  const cx = x + KEY_WIDTH / 2;
  switch (direction) {
    case "up":
      return `M ${cx - 6} ${y + 14} L ${cx} ${y + 7} L ${cx + 6} ${y + 14}`;
    case "down":
      return `M ${cx - 6} ${y + 8} L ${cx} ${y + 15} L ${cx + 6} ${y + 8}`;
    case "left":
      return `M ${cx + 4} ${y + 6} L ${cx - 2} ${y + 11.5} L ${cx + 4} ${y + 17}`;
    case "right":
      return `M ${cx - 4} ${y + 6} L ${cx + 2} ${y + 11.5} L ${cx - 4} ${y + 17}`;
  }
}

/**
 * WASD keycap hint, rendered over the table's bottom-right corner.  Purely
 * decorative: the scroll viewport itself carries the accessible label.
 */
export default function WasdHint({
  pressed = [],
}: {
  /** Keys currently held down (lower-case W/A/S/D). */
  pressed?: readonly string[];
}) {
  return (
    <Box
      component="svg"
      viewBox="0 0 136 94"
      aria-hidden
      sx={{
        display: "block",
        width: 132,
        height: 91,
        pointerEvents: "none",
        userSelect: "none",
        filter: "drop-shadow(0 1px 4px rgba(0, 0, 0, 0.22))",
      }}
    >
      {KEYCAPS.map((keycap) => {
        const isPressed = pressed.includes(keycap.id);
        const glyph = isPressed
          ? BRIEFING_CSS_COLORS.primaryContrastText
          : BRIEFING_CSS_COLORS.textPrimary;
        return (
          <g key={keycap.id}>
            {/* Key face: light fill with a strong outline so it reads over the
                table rows showing through the transparent canvas. */}
            <rect
              x={keycap.x}
              y={keycap.y}
              width={KEY_WIDTH}
              height={KEY_HEIGHT}
              rx={KEY_RADIUS}
              style={{
                fill: BRIEFING_CSS_COLORS.surfaceVariant,
                stroke: BRIEFING_CSS_COLORS.textSecondary,
                strokeWidth: 1.2,
              }}
            />
            {/* Active fill: held key only. */}
            <rect
              data-keycap={keycap.id}
              data-pressed={isPressed ? "true" : "false"}
              x={keycap.x}
              y={keycap.y}
              width={KEY_WIDTH}
              height={KEY_HEIGHT}
              rx={KEY_RADIUS}
              style={{
                fill: BRIEFING_CSS_COLORS.primaryMain,
                stroke: BRIEFING_CSS_COLORS.primaryMain,
                strokeWidth: 1.2,
                opacity: isPressed ? 1 : 0,
              }}
            />
            <path
              data-direction={keycap.direction}
              d={directionArrow(keycap.direction, keycap.x, keycap.y)}
              fill="none"
              style={{
                stroke: glyph,
                strokeWidth: 2.4,
                strokeLinecap: "round",
                strokeLinejoin: "round",
              }}
            />
            <text
              x={keycap.x + KEY_WIDTH / 2}
              y={keycap.y + 37}
              textAnchor="middle"
              style={{
                fill: glyph,
                fontSize: 18,
                fontWeight: 700,
                fontFamily: "inherit",
              }}
            >
              {keycap.label}
            </text>
          </g>
        );
      })}
    </Box>
  );
}

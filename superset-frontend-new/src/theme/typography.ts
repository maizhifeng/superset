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
 * Monospace stack for code surfaces (SQL editors, expressions, IDs).
 *
 * ``JetBrains Mono`` is preferred when installed locally; the remaining entries
 * keep code legible in offline, CSP-restricted, and CJK environments.
 */
export const monoFontFamily = [
  '"JetBrains Mono"',
  '"SF Mono"',
  '"Fira Code"',
  '"Cascadia Code"',
  "ui-monospace",
  "Menlo",
  "Consolas",
  '"Liberation Mono"',
  "monospace",
].join(",");

export default {
  fontFamily: [
    "Sora",
    "-apple-system",
    "BlinkMacSystemFont",
    '"Segoe UI"',
    "Roboto",
    '"Helvetica Neue"',
    "Arial",
    "sans-serif",
  ].join(","),
  h1: {
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif",
    fontSize: "2rem",
    fontWeight: 650,
    lineHeight: 1.25,
    letterSpacing: "-0.01em",
  },
  h2: {
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif",
    fontSize: "1.75rem",
    fontWeight: 650,
    lineHeight: 1.3,
    letterSpacing: "-0.01em",
  },
  h3: {
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif",
    fontSize: "1.5rem",
    fontWeight: 600,
    lineHeight: 1.35,
    letterSpacing: "-0.005em",
  },
  h4: {
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif",
    fontSize: "1.25rem",
    fontWeight: 600,
    lineHeight: 1.4,
    letterSpacing: "-0.005em",
  },
  h5: {
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif",
    fontSize: "1.1rem",
    fontWeight: 600,
    lineHeight: 1.45,
    letterSpacing: 0,
  },
  h6: {
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif",
    fontSize: "1rem",
    fontWeight: 600,
    lineHeight: 1.5,
    letterSpacing: 0,
  },
  // Card and panel headings sit at the same level as ``h6``; they share the
  // serif display family so a section title and a card title never differ in
  // typeface at the same size.
  subtitle1: {
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif",
    fontSize: "1rem",
    fontWeight: 600,
    lineHeight: 1.5,
    letterSpacing: 0,
  },
  subtitle2: {
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif",
    fontSize: "0.9375rem",
    fontWeight: 600,
    lineHeight: 1.5,
    letterSpacing: 0,
  },
  body1: { fontSize: "0.875rem", lineHeight: 1.6 },
  body2: { fontSize: "0.8125rem", lineHeight: 1.55 },
  button: { textTransform: "none", fontWeight: 500 },
  caption: { fontSize: "0.75rem", lineHeight: 1.5, letterSpacing: "0.01em" },
};

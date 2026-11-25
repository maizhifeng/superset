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

import type { KeyboardEvent } from "react";
import { expect, test, vi } from "vitest";
import {
  formatQueryPreview,
  formatStatSummary,
  handleRowKeyDown,
  readRecentQueries,
} from "../utils/homeFormatting";

test.each(["Enter", " "])("activates a row with %s", (key) => {
  const currentTarget = document.createElement("div");
  const preventDefault = vi.fn();
  const action = vi.fn();
  const event = {
    key,
    target: currentTarget,
    currentTarget,
    preventDefault,
  } as unknown as KeyboardEvent<HTMLElement>;

  handleRowKeyDown(event, action);

  expect(action).toHaveBeenCalledOnce();
  expect(preventDefault).toHaveBeenCalledOnce();
});

test("ignores row keys from nested controls and unsupported keys", () => {
  const currentTarget = document.createElement("div");
  const action = vi.fn();
  const preventDefault = vi.fn();

  handleRowKeyDown(
    {
      key: "Enter",
      target: document.createElement("button"),
      currentTarget,
      preventDefault,
    } as unknown as KeyboardEvent<HTMLElement>,
    action,
  );
  handleRowKeyDown(
    {
      key: "Escape",
      target: currentTarget,
      currentTarget,
      preventDefault,
    } as unknown as KeyboardEvent<HTMLElement>,
    action,
  );

  expect(action).not.toHaveBeenCalled();
  expect(preventDefault).not.toHaveBeenCalled();
});

test("formats the copied statistic summary with explicit failures", () => {
  expect(
    formatStatSummary([
      { label: "图表数", value: 12 },
      { label: "仪表板数", value: 0, error: "offline" },
    ]),
  ).toBe("图表数: 12\n仪表板数: 加载失败");
});

test.each([
  [null, []],
  ["not-json", []],
  ['{"queries":[]}', []],
] as const)(
  "reads invalid recent query storage %j as empty",
  (raw, expected) => {
    expect(readRecentQueries(raw)).toEqual(expected);
  },
);

test("limits recent queries to eight entries", () => {
  const queries = Array.from({ length: 10 }, (_, index) => `select ${index}`);

  expect(readRecentQueries(JSON.stringify(queries))).toEqual(
    queries.slice(0, 8),
  );
});

test("formats a recent query preview without changing the stored query", () => {
  expect(formatQueryPreview("\nselect\n\n* from table\n")).toBe(
    "select * from table",
  );
  expect(formatQueryPreview("x".repeat(100))).toBe("x".repeat(80));
});

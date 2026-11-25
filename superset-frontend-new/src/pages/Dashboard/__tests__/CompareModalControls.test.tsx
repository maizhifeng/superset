/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import type { ComponentProps } from "react";
import { CompareModalControls } from "@/pages/Dashboard/CompareModalControls";

function makeProps(
  overrides: Partial<ComponentProps<typeof CompareModalControls>> = {},
): ComponentProps<typeof CompareModalControls> {
  return {
    selectedAnchors: ["上线时间"],
    periodDays: 30,
    timeGrain: "P1D",
    ltvMode: "raw",
    loading: false,
    queryDisabled: false,
    onToggleAnchor: vi.fn(),
    onPeriodDaysChange: vi.fn(),
    onTimeGrainChange: vi.fn(),
    onLtvModeChange: vi.fn(),
    onQuery: vi.fn(),
    onScrollByStep: vi.fn(),
    ...overrides,
  };
}

test("keeps comparison controls ordered and dispatches their changes", () => {
  const props = makeProps();
  render(<CompareModalControls {...props} />);

  expect(screen.getByText("基准")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "上线后 30 天" }),
  ).toBeInTheDocument();

  userEvent.click(screen.getByRole("button", { name: "首测" }));
  userEvent.click(screen.getByRole("button", { name: "上线后 7 天" }));
  userEvent.click(screen.getByRole("button", { name: "周" }));
  userEvent.click(screen.getByRole("button", { name: "首日倍率" }));
  userEvent.click(screen.getByRole("button", { name: "查询" }));
  userEvent.click(screen.getByRole("button", { name: "向左滚动" }));
  userEvent.click(screen.getByRole("button", { name: "向右滚动" }));

  expect(props.onToggleAnchor).toHaveBeenCalledWith("首测起始时间");
  expect(props.onPeriodDaysChange).toHaveBeenCalledWith(7);
  expect(props.onTimeGrainChange).toHaveBeenCalledWith("P1W");
  expect(props.onLtvModeChange).toHaveBeenCalledWith("first");
  expect(props.onQuery).toHaveBeenCalledOnce();
  expect(props.onScrollByStep).toHaveBeenNthCalledWith(1, -1);
  expect(props.onScrollByStep).toHaveBeenNthCalledWith(2, 1);
});

test("preserves disabled, loading, and multi-anchor labels", () => {
  const props = makeProps({
    selectedAnchors: ["上线时间", "首测起始时间"],
    loading: true,
    queryDisabled: true,
  });
  render(<CompareModalControls {...props} />);

  expect(
    screen.getByRole("button", { name: "各轮次后 30 天" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "..." })).toBeDisabled();
  expect(screen.getAllByText("外对比")).toHaveLength(1);
});

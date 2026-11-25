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

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import ChapterNav from "@/pages/Briefing/ChapterNav";
import { reportChapters } from "@/pages/Briefing/chapters";

class MockIntersectionObserver {
  observe = vi.fn();
  disconnect = vi.fn();
  constructor(_callback: IntersectionObserverCallback) {}
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("report chapters keep the business section order", () => {
  expect(reportChapters("分周对比").map((chapter) => chapter.label)).toEqual([
    "核心指标",
    "分周对比",
    "主游戏分析",
    "媒体分析",
  ]);
});

test("chapter navigation exposes buttons and forwards jumps", () => {
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
  const onJump = vi.fn();
  render(<ChapterNav chapters={reportChapters("分天对比")} onJump={onJump} />);

  expect(screen.getByRole("navigation", { name: "章节导航" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "媒体分析" }));

  expect(onJump).toHaveBeenCalledWith("sec-media");
});

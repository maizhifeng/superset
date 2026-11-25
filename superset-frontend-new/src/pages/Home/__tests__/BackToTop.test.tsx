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
import { expect, test, vi } from "vitest";
import BackToTop from "../components/BackToTop";

test("shows the back-to-top action after scrolling and smoothly scrolls home", () => {
  const scrollTo = vi.fn();
  const scrollContainer = document.createElement("div");
  Object.defineProperty(scrollContainer, "scrollTo", { value: scrollTo });
  render(<BackToTop scrollRef={{ current: scrollContainer }} />);

  expect(
    screen.queryByRole("button", { name: "返回顶部" }),
  ).not.toBeInTheDocument();

  scrollContainer.scrollTop = 401;
  fireEvent.scroll(scrollContainer);
  fireEvent.click(screen.getByRole("button", { name: "返回顶部" }));

  expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
});

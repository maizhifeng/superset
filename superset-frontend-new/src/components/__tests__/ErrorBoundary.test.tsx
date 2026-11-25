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
import ErrorBoundary from "@/components/ErrorBoundary";

test("shows a render error and retries with a fresh child tree", () => {
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  let shouldThrow = true;
  function Recoverable() {
    if (shouldThrow) throw new Error("render boom");
    return <div>recovered</div>;
  }

  try {
    render(
      <ErrorBoundary>
        <Recoverable />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("页面加载失败");
    expect(screen.getByText("render boom")).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    expect(screen.getByText("recovered")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  } finally {
    consoleError.mockRestore();
  }
});

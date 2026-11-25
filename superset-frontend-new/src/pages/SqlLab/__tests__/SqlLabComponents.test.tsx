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
import QueryResultsEmptyState from "@/pages/SqlLab/QueryResultsEmptyState";
import SchemaContextMenu from "@/pages/SqlLab/SchemaContextMenu";
import SqlLabDialogs from "@/pages/SqlLab/SqlLabDialogs";

test("query empty state explains the active mode", () => {
  const { rerender } = render(<QueryResultsEmptyState mode="sql" />);
  expect(screen.getByText("运行 SQL 以查看结果")).toBeVisible();

  rerender(<QueryResultsEmptyState mode="visual" />);
  expect(screen.getByText("运行可视化查询以查看结果")).toBeVisible();
});

test("schema context menu forwards table and column actions", () => {
  const onInsertColumn = vi.fn();
  const onCopy = vi.fn();
  const onClose = vi.fn();
  render(
    <SchemaContextMenu
      ctxMenu={{ mouseX: 10, mouseY: 20, table: "orders", column: "id" }}
      schema="public"
      columnCache={{}}
      onInsertColumn={onInsertColumn}
      onInsertTable={vi.fn()}
      onCopy={onCopy}
      onClose={onClose}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "插入列：orders.id" }));
  fireEvent.click(screen.getByRole("button", { name: "复制列名" }));

  expect(onInsertColumn).toHaveBeenCalledWith("orders", "id");
  expect(onCopy).toHaveBeenCalledWith("orders.id");
  expect(onClose).toHaveBeenCalledOnce();
});

test("SQL Lab dialogs save a query and close", () => {
  const onSaveQueryOpenChange = vi.fn();
  const onSaveQuery = vi.fn();
  render(
    <SqlLabDialogs
      saveQueryOpen
      saveQuerySaving={false}
      saveQueryLabel="Daily orders"
      saveQueryError={null}
      onSaveQueryOpenChange={onSaveQueryOpenChange}
      onSaveQueryLabelChange={vi.fn()}
      onSaveQuery={onSaveQuery}
      switchDialog={null}
      onSwitchDialogClose={vi.fn()}
      onApplyVisualModel={vi.fn()}
      onNewVisualQuery={vi.fn()}
      pendingContext={null}
      onPendingContextClose={vi.fn()}
      onConfirmContextChange={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "保存" }));

  expect(onSaveQuery).toHaveBeenCalledOnce();
  expect(screen.getByRole("heading", { name: "保存查询" })).toBeVisible();
});

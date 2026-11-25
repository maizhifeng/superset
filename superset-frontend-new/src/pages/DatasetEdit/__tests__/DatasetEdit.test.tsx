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

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import DatasetEdit from "@/pages/DatasetEdit";
import type { DatasetDetail } from "@/types/api";
import type { DatasetSavePayload } from "../types";
import { createDataset } from "./fixtures";

const mocks = vi.hoisted(() => ({
  getDataset: vi.fn(),
  put: vi.fn(),
  navigate: vi.fn(),
  notify: vi.fn(),
  setCustom: vi.fn(),
  registerTools: vi.fn(),
  unregisterTools: vi.fn(),
  writeText: vi.fn(),
}));

vi.mock("@/api", () => ({
  default: { put: mocks.put },
  getDataset: mocks.getDataset,
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useParams: () => ({ id: "7" }),
    useNavigate: () => mocks.navigate,
  };
});

vi.mock("@/store/breadcrumbStore", () => ({
  useBreadcrumbStore: (
    selector: (state: { setCustom: typeof mocks.setCustom }) => unknown,
  ) => selector({ setCustom: mocks.setCustom }),
}));

vi.mock("@/store/notificationStore", () => ({
  useNotificationStore: (
    selector: (state: { notify: typeof mocks.notify }) => unknown,
  ) => selector({ notify: mocks.notify }),
}));

vi.mock("@/store/toolbarStore", () => ({
  useToolbarStore: () => ({
    registerTools: mocks.registerTools,
    unregisterTools: mocks.unregisterTools,
  }),
}));

vi.mock("@/components/DateColumnDetector", () => ({
  default: () => null,
}));

interface SqlEditorMockProps {
  value: string;
  dirty: boolean;
  onChange: (value: string) => void;
  onFormat: () => void;
  onCopy: () => void;
  onReset: () => void;
  onSave: () => void;
}

vi.mock("@/components/SqlQueryEditor", () => ({
  default: ({
    value,
    dirty,
    onChange,
    onFormat,
    onCopy,
    onReset,
    onSave,
  }: SqlEditorMockProps) => (
    <div>
      <textarea
        aria-label="SQL 编辑器"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {dirty && <span>未保存修改</span>}
      <button type="button" onClick={onFormat}>
        格式化
      </button>
      <button type="button" onClick={onCopy}>
        复制 SQL
      </button>
      <button type="button" onClick={onReset}>
        还原 SQL
      </button>
      <button type="button" onClick={onSave}>
        保存 SQL
      </button>
    </div>
  ),
}));

beforeEach(() => {
  mocks.getDataset.mockReset();
  mocks.put.mockReset();
  mocks.navigate.mockReset();
  mocks.notify.mockReset();
  mocks.setCustom.mockReset();
  mocks.registerTools.mockReset();
  mocks.unregisterTools.mockReset();
  mocks.writeText.mockReset();
  mocks.getDataset.mockResolvedValue(createDataset());
  mocks.put.mockResolvedValue({ data: {} });
  mocks.writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: mocks.writeText },
  });
});

async function renderLoaded(dataset: DatasetDetail = createDataset()) {
  mocks.getDataset.mockResolvedValue(dataset);
  render(<DatasetEdit />);
  await screen.findByRole("textbox", { name: "数据集名称" });
  return dataset;
}

function lastSavePayload(): DatasetSavePayload {
  const call = mocks.put.mock.calls.at(-1);
  if (!call) throw new Error("Expected a dataset save request");
  return call[1] as DatasetSavePayload;
}

test("loads the dataset and saves column flags through the existing API shape", async () => {
  await renderLoaded();

  expect(screen.getByRole("textbox", { name: "数据集名称" })).toHaveValue(
    "orders",
  );
  expect(mocks.setCustom).toHaveBeenCalledWith({ label: "编辑：orders" });
  const search = screen.getByPlaceholderText("搜索数据列...");
  fireEvent.change(search, { target: { value: "amount" } });
  expect(screen.queryByText("order_date")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: /^指标/ }));
  fireEvent.click(screen.getByRole("tab", { name: /^数据列/ }));
  expect(screen.getByPlaceholderText("搜索数据列...")).toHaveValue("amount");
  expect(screen.queryByText("order_date")).not.toBeInTheDocument();
  const row = screen.getByText("amount").closest("tr");
  if (!row) throw new Error("Expected the amount column row");
  const [dateCheckbox, filterCheckbox] = within(row).getAllByRole("checkbox");
  fireEvent.click(dateCheckbox);
  fireEvent.click(filterCheckbox);
  expect(dateCheckbox).toBeChecked();
  expect(filterCheckbox).toBeChecked();

  fireEvent.click(screen.getByRole("button", { name: "保存" }));

  await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
  expect(mocks.put.mock.calls[0]?.[0]).toBe("/dataset/7");
  expect(lastSavePayload().columns).toEqual([
    { id: 2, column_name: "order_date", extra: null },
    {
      id: 1,
      column_name: "amount",
      is_dttm: true,
      extra: '{"dashboard_filter":true}',
    },
  ]);
  expect(await screen.findByText("数据集已保存")).toBeInTheDocument();
});

test("keeps SQL dirty preview, formatting, copy, reset and override behavior", async () => {
  const dataset = await renderLoaded();
  fireEvent.click(screen.getByRole("tab", { name: "SQL" }));
  const editor = screen.getByLabelText("SQL 编辑器");
  expect(editor).toHaveValue(dataset.sql);

  fireEvent.change(editor, {
    target: { value: "select id from sales.orders" },
  });
  expect(screen.getByText("未保存修改")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "格式化" }));
  const formatted = (editor as HTMLTextAreaElement).value;
  expect(formatted).toContain("SELECT\n");
  expect(formatted).toContain("FROM\n");

  fireEvent.click(screen.getByRole("button", { name: "复制 SQL" }));
  await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith(formatted));
  expect(mocks.notify).toHaveBeenCalledWith({
    severity: "success",
    message: "已复制当前 SQL",
  });

  fireEvent.click(screen.getByRole("button", { name: "还原 SQL" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "还原" }));
  expect(editor).toHaveValue(dataset.sql);
  expect(screen.queryByText("未保存修改")).not.toBeInTheDocument();
  expect(mocks.notify).toHaveBeenCalledWith({
    severity: "info",
    message: "已还原为已保存的 SQL",
  });
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );

  fireEvent.change(editor, {
    target: { value: "select id from sales.orders" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
  expect(mocks.put.mock.calls[0]?.[0]).toBe("/dataset/7?override_columns=true");
  expect(lastSavePayload().columns).toEqual([
    {
      column_name: "order_date",
      type: "DATE",
      is_dttm: true,
      extra: null,
    },
    {
      column_name: "amount",
      type: "NUMERIC",
      is_dttm: false,
      extra: JSON.stringify({ dashboard_filter: false }),
    },
  ]);
});

test("validates, adds, edits and deletes metrics without changing validation rules", async () => {
  await renderLoaded();
  fireEvent.click(screen.getByRole("tab", { name: /^指标/ }));
  fireEvent.click(screen.getByRole("button", { name: "添加指标" }));
  let dialog = screen.getByRole("dialog");
  const addButton = within(dialog).getByRole("button", { name: "添加" });
  expect(addButton).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText("指标名称"), {
    target: { value: "average" },
  });
  fireEvent.change(within(dialog).getByLabelText("表达式"), {
    target: { value: "AVG(amount)" },
  });
  fireEvent.click(addButton);
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("tab", { name: "指标 (3)" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "编辑指标 average" }));
  dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("表达式"), {
    target: { value: "AVG(amount) * 2" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(screen.getByText("AVG(amount) * 2")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "删除指标 average" }));
  expect(screen.getByRole("tab", { name: "指标 (2)" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "添加指标" }));
  dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("指标名称"), {
    target: { value: "total" },
  });
  fireEvent.change(within(dialog).getByLabelText("表达式"), {
    target: { value: "COUNT(*)" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "添加" }));
  expect(within(dialog).getByRole("alert")).toHaveTextContent(
    "已存在同名指标，请更换名称",
  );
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(screen.getByRole("tab", { name: "指标 (2)" })).toBeInTheDocument();
});

test("edits profit settings and appends available sources to calculated columns", async () => {
  await renderLoaded();
  fireEvent.click(screen.getByRole("tab", { name: "额外配置" }));
  fireEvent.change(screen.getByLabelText("游戏名称列名"), {
    target: { value: "main_game" },
  });
  fireEvent.change(screen.getByLabelText("渠道名称列名"), {
    target: { value: "partner" },
  });
  fireEvent.click(screen.getByRole("button", { name: "添加计算列" }));
  fireEvent.change(screen.getByLabelText("名称"), {
    target: { value: "net_cost" },
  });
  const formula = screen.getByLabelText("公式");
  fireEvent.change(formula, { target: { value: "base + " } });
  fireEvent.click(screen.getByText("amount"));
  fireEvent.click(screen.getByText("分成比例"));
  expect(formula).toHaveValue("base + amount分成比例");

  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
  expect(JSON.parse(lastSavePayload().extra ?? "{}")).toEqual({
    profit_sharing: {
      papp_name_column: "main_game",
      channel_name_column: "partner",
    },
    computed_columns: [
      { name: "net_cost", formula: "base + amount分成比例", type: "float" },
    ],
  });
});

test("copies saved dataset SQL and identifiers from the header menu", async () => {
  await renderLoaded();
  fireEvent.click(screen.getByRole("button", { name: "复制" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "复制查询 SQL" }));
  await waitFor(() =>
    expect(mocks.writeText).toHaveBeenCalledWith("select * from sales.orders"),
  );

  fireEvent.click(screen.getByRole("button", { name: "复制" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "复制数据集 ID" }));
  await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith("7"));
});

test("surfaces load failures without rendering the editor", async () => {
  mocks.getDataset.mockRejectedValue(new Error("load failed"));
  render(<DatasetEdit />);

  expect(
    await screen.findByText("网络异常，请检查网络连接后重试"),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("textbox", { name: "数据集名称" }),
  ).not.toBeInTheDocument();
  expect(mocks.put).not.toHaveBeenCalled();
});

test("keeps the editor open and shows backend validation errors after failed saves", async () => {
  mocks.put.mockRejectedValue({
    response: { status: 422, data: { message: "invalid formula" } },
  });
  await renderLoaded();
  fireEvent.click(screen.getByRole("button", { name: "保存" }));

  expect(await screen.findByText("invalid formula")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "数据集名称" })).toHaveValue(
    "orders",
  );
  expect(screen.queryByText("数据集已保存")).not.toBeInTheDocument();
  expect(mocks.navigate).not.toHaveBeenCalled();
});

import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CreateAlertDialog from "@/pages/AlertReportList/CreateAlertDialog";
import { test, expect, vi } from "vitest";

const mockApiPost = vi.fn();
const mockApiPut = vi.fn();
const mockApiGet = vi.fn();
vi.mock("@/api", () => ({
  default: {
    post: (...a: unknown[]) => mockApiPost(...a),
    put: (...a: unknown[]) => mockApiPut(...a),
    get: (...a: unknown[]) => mockApiGet(...a),
  },
}));

const charts = [
  { id: 1, slice_name: "营收表" },
  { id: 2, slice_name: "转化表" },
];
const databases = [{ id: 3, database_name: "starfly_config" }];

function renderDialog({ onCreated = () => {}, onClose = () => {} } = {}) {
  return render(
    <CreateAlertDialog
      open
      onClose={onClose}
      onCreated={onCreated}
      charts={charts}
      databases={databases}
    />,
  );
}

// The name TextField's label carries a required marker; match by contains.
function nameInput() {
  return screen.getByLabelText(/警报名称/);
}

function sqlInput() {
  return screen.getByLabelText(/触发查询 SQL/);
}

test("renders required fields when open", () => {
  renderDialog();
  expect(nameInput()).toBeInTheDocument();
  expect(screen.getByLabelText(/定时/)).toBeInTheDocument();
  expect(screen.getByLabelText(/收件人邮箱/)).toBeInTheDocument();
});

test("shows validation error when required fields missing", async () => {
  renderDialog();
  await userEvent.click(screen.getByRole("button", { name: "创建" }));
  await waitFor(() => {
    expect(screen.getByText("请填写警报名称")).toBeInTheDocument();
  });
  expect(mockApiPost).not.toHaveBeenCalled();
});

test("posts valid payload and closes on success", async () => {
  const onCreated = vi.fn();
  const onClose = vi.fn();
  renderDialog({ onCreated, onClose });
  // Fully-synchronous interaction (fireEvent + act) avoids userEvent's async
  // act-waiting, which is flaky under concurrent full-suite load.
  act(() => {
    fireEvent.change(nameInput(), { target: { value: "test alert" } });
  });
  // Select chart (1) and database (3) via MUI's mouseDown+option pattern.
  act(() => {
    fireEvent.mouseDown(screen.getByLabelText(/关联图表/));
  });
  const chartOption = screen
    .getAllByRole("option")
    .find((o) => o.textContent?.includes("营收表"));
  if (chartOption) act(() => fireEvent.click(chartOption));
  act(() => {
    fireEvent.mouseDown(screen.getByLabelText(/数据库/));
  });
  const dbOption = screen
    .getAllByRole("option")
    .find((o) => o.textContent?.includes("starfly_config"));
  if (dbOption) act(() => fireEvent.click(dbOption));
  act(() => {
    fireEvent.change(sqlInput(), {
      target: { value: "SELECT COUNT(*) FROM orders" },
    });
  });
  mockApiPost.mockResolvedValueOnce({});
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: "创建" }));
  });
  await waitFor(
    () => {
      expect(mockApiPost).toHaveBeenCalledWith(
        "/report/",
        expect.objectContaining({
          name: "test alert",
          type: "Alert",
          chart: 1,
          database: 3,
          sql: "SELECT COUNT(*) FROM orders",
          validator_type: "not null",
          active: true,
        }),
      );
    },
    { timeout: 4000 },
  );
  expect(onCreated).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

test("edit mode prefills the report and saves via PUT", async () => {
  const onCreated = vi.fn();
  const onClose = vi.fn();
  mockApiGet.mockResolvedValueOnce({
    data: {
      result: {
        name: "旧警报",
        crontab: "0 8 * * *",
        sql: "SELECT COUNT(*) FROM t",
        chart: { id: 1 },
        database: { id: 3 },
        validator_type: "not null",
        validator_config_json: "{}",
      },
    },
  });
  mockApiPut.mockResolvedValueOnce({});
  render(
    <CreateAlertDialog
      open
      editing={{ id: 9, name: "旧警报", type: "Alert", active: true, crontab: "0 8 * * *", recipients: "" }}
      onClose={onClose}
      onCreated={onCreated}
      charts={charts}
      databases={databases}
    />,
  );
  // Detail loads and prefills the name
  await screen.findByDisplayValue("旧警报");
  expect(screen.getByText("编辑警报")).toBeInTheDocument();
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: /保存/ }));
  });
  await waitFor(
    () => {
      expect(mockApiPut).toHaveBeenCalledWith(
        "/report/9",
        expect.objectContaining({
          name: "旧警报",
          type: "Alert",
          chart: 1,
          database: 3,
          sql: "SELECT COUNT(*) FROM t",
        }),
      );
    },
    { timeout: 4000 },
  );
  expect(onCreated).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

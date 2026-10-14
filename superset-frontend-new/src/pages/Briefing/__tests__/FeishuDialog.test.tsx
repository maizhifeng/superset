import { render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { test, expect, vi, beforeEach, type Mock } from "vitest";
import FeishuDialog from "@/pages/Briefing/FeishuDialog";
import { useNotificationStore } from "@/store/notificationStore";
import api from "@/api";

vi.mock("@/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
  QUERY_TIMEOUT_MS: 300_000,
}));

/** Typed so the mocked endpoints may return promises. */
type ApiMock = {
  get: Mock<(url: string) => Promise<{ data: unknown }>>;
  post: Mock<(url: string, body?: unknown) => Promise<{ data: unknown }>>;
  put: Mock<(url: string, body?: unknown) => Promise<{ data: unknown }>>;
};

const mockApi = api as unknown as ApiMock;

const SETTINGS = {
  enabled: true,
  msg_type: "interactive",
  include_tables: false,
  targets: [{ receive_id_type: "chat_id", receive_id: "oc_group" }],
  app_configured: true,
  app_id_masked: "cli_ab****",
  api_base: "https://open.feishu.cn",
  scheduled_dry_run: false,
  frontend_url: "http://localhost:9000/briefing/1",
  last_push: null,
  last_result: {
    report_date: "2026-09-27",
    report_type: "daily",
    finished_at: "2026-09-28T01:00:50+00:00",
    stale: false,
  },
};

function mockLoad(
  settings: Record<string, unknown> = SETTINGS,
  chats: { chat_id: string; name: string }[] = [],
) {
  mockApi.get.mockImplementation((url: string) => {
    if (url.includes("/feishu/chats")) {
      return Promise.resolve({
        data: { result: { available: true, reason: "", chats } },
      });
    }
    return Promise.resolve({ data: { result: settings } });
  });
}

beforeEach(() => {
  mockApi.get.mockReset();
  mockApi.post.mockReset();
  mockApi.put.mockReset();
  useNotificationStore.setState({ notifications: [] });
});

/** Messages surfaced by the dialog through the snackbar store. */
function notificationMessages(): string[] {
  return useNotificationStore.getState().notifications.map((n) => n.message);
}

test("warns when the deployment has no Feishu credentials", async () => {
  mockLoad({ ...SETTINGS, app_configured: false, targets: [] });
  render(
    <FeishuDialog open configId={1} configName="测试日报" onClose={() => {}} />,
  );
  await waitFor(() =>
    expect(screen.getByText(/未配置飞书应用凭证/)).toBeInTheDocument(),
  );
});

test("warns when scheduled pushes are dry runs", async () => {
  mockLoad({ ...SETTINGS, scheduled_dry_run: true });
  render(
    <FeishuDialog open configId={1} configName="测试日报" onClose={() => {}} />,
  );
  await waitFor(() => expect(screen.getByText(/试运行/)).toBeInTheDocument());
});

test("loads saved targets and saves the edited payload", async () => {
  mockLoad();
  mockApi.put.mockResolvedValue({ data: { result: SETTINGS } });
  const onChanged = vi.fn();
  render(
    <FeishuDialog
      open
      configId={7}
      configName="测试日报"
      onClose={() => {}}
      onChanged={onChanged}
    />,
  );

  const targetInput = await screen.findByDisplayValue("oc_group");
  fireEvent.change(targetInput, { target: { value: "oc_other" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));

  await waitFor(() => expect(mockApi.put).toHaveBeenCalledTimes(1));
  expect(mockApi.put).toHaveBeenCalledWith(
    "/briefing/configs/7/feishu",
    expect.objectContaining({
      enabled: true,
      msg_type: "interactive",
      include_tables: false,
      targets: [{ receive_id_type: "chat_id", receive_id: "oc_other" }],
    }),
  );
  expect(onChanged).toHaveBeenCalled();
});

test("blocks saving when the scheduled switch has no target", async () => {
  mockLoad({ ...SETTINGS, targets: [] });
  render(
    <FeishuDialog open configId={1} configName="测试日报" onClose={() => {}} />,
  );
  await screen.findByText("启用定时推送");
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() =>
    expect(notificationMessages().join("；")).toContain("至少一个目标"),
  );
  expect(mockApi.put).not.toHaveBeenCalled();
});

test("adds and removes target rows", async () => {
  mockLoad({ ...SETTINGS, targets: [] });
  render(
    <FeishuDialog open configId={1} configName="测试日报" onClose={() => {}} />,
  );
  await screen.findByText("添加目标");
  expect(screen.queryByLabelText("群 / chat_id")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /添加目标/ }));
  expect(await screen.findByLabelText("群 / chat_id")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "移除" }));
  await waitFor(() =>
    expect(screen.queryByLabelText("群 / chat_id")).not.toBeInTheDocument(),
  );
});

test("test push sends the unsaved form values", async () => {
  mockLoad();
  mockApi.post.mockResolvedValue({
    data: {
      result: {
        ok: true,
        dry_run: false,
        sent: [{ target: "chat_id:oc_group", ok: true, message: "" }],
      },
    },
  });
  render(
    <FeishuDialog open configId={5} configName="测试日报" onClose={() => {}} />,
  );
  await screen.findByDisplayValue("oc_group");
  fireEvent.click(screen.getByRole("button", { name: "测试推送" }));

  await waitFor(() => expect(mockApi.post).toHaveBeenCalledTimes(1));
  expect(mockApi.post).toHaveBeenCalledWith("/briefing/configs/5/feishu/test", {
    msg_type: "interactive",
    include_tables: false,
    include_doc: true,
    split_chapters: true,
    targets: [{ receive_id_type: "chat_id", receive_id: "oc_group" }],
  });
});

test("turning on sub-tables saves the switch and sends it with the test push", async () => {
  mockLoad();
  mockApi.put.mockResolvedValue({ data: { result: SETTINGS } });
  mockApi.post.mockResolvedValue({
    data: { result: { ok: true, dry_run: false, sent: [] } },
  });
  render(
    <FeishuDialog open configId={9} configName="测试日报" onClose={() => {}} />,
  );
  await screen.findByDisplayValue("oc_group");

  // MUI renders a Switch with role="switch".
  const tablesSwitch = screen.getByRole("switch", { name: /推送子表格/ });
  fireEvent.click(tablesSwitch);
  fireEvent.click(screen.getByRole("button", { name: "测试推送" }));
  await waitFor(() => expect(mockApi.post).toHaveBeenCalledTimes(1));
  expect(mockApi.post.mock.calls[0][1]).toMatchObject({ include_tables: true });

  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(mockApi.put).toHaveBeenCalledTimes(1));
  expect(mockApi.put.mock.calls[0][1]).toMatchObject({ include_tables: true });
});

test("shows which report a push will send", async () => {
  mockLoad();
  render(
    <FeishuDialog open configId={1} configName="测试日报" onClose={() => {}} />,
  );
  expect(await screen.findByText(/将推送最新报告/)).toBeInTheDocument();
  expect(screen.getByText(/日报 2026-09-27/)).toBeInTheDocument();
});

test("warns when the stored report is old", async () => {
  mockLoad({
    ...SETTINGS,
    last_result: {
      report_date: "2026-08-29",
      report_type: "weekly",
      finished_at: "2026-08-24T11:30:31+00:00",
      stale: true,
      age_hours: 830.5,
    },
  });
  render(
    <FeishuDialog open configId={1} configName="测试日报" onClose={() => {}} />,
  );
  expect(
    await screen.findByText(/该结果已生成 830.5 小时/),
  ).toBeInTheDocument();
});

test("warns when the stored report is not the latest day", async () => {
  mockLoad({
    ...SETTINGS,
    last_result: {
      ...SETTINGS.last_result,
      report_date: "2026-08-29",
      stale: true,
      expected_report_date: "2026-09-27",
    },
  });
  render(
    <FeishuDialog open configId={1} configName="测试日报" onClose={() => {}} />,
  );
  expect(
    await screen.findByText(/建议先在详情页重新运行简报/),
  ).toBeInTheDocument();
});

test("blocks pushing until the briefing has been generated", async () => {
  mockLoad({ ...SETTINGS, last_result: null });
  render(
    <FeishuDialog
      open
      configId={1}
      configName="测试日报"
      hasResult
      onClose={() => {}}
    />,
  );
  expect(
    await screen.findByText(/还没有生成结果，请先在详情页运行简报/),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "测试推送" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "立即推送" })).toBeDisabled();
});

test("a chat_id can always be typed by hand", async () => {
  mockLoad(SETTINGS, [{ chat_id: "oc_daily", name: "日报群" }]);
  render(
    <FeishuDialog open configId={1} configName="测试日报" onClose={() => {}} />,
  );
  const input = await screen.findByLabelText("群 / chat_id");
  fireEvent.change(input, { target: { value: "oc_typed_by_hand" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(mockApi.put).toHaveBeenCalledTimes(1));
  expect(mockApi.put).toHaveBeenCalledWith(
    "/briefing/configs/1/feishu",
    expect.objectContaining({
      targets: [{ receive_id_type: "chat_id", receive_id: "oc_typed_by_hand" }],
    }),
  );
});

test("selecting a group stores the bare chat_id, not its label", async () => {
  mockLoad({ ...SETTINGS, targets: [] }, [
    { chat_id: "oc_daily", name: "数据支撑组(4人组)" },
  ]);
  render(
    <FeishuDialog open configId={3} configName="测试日报" onClose={() => {}} />,
  );
  // A target row has to exist before the picker renders.
  fireEvent.click(await screen.findByRole("button", { name: /添加目标/ }));
  const input = await screen.findByLabelText("群 / chat_id");
  // Paste a label the way the old picker produced it.
  fireEvent.change(input, {
    target: { value: "数据支撑组(4人组)（oc_daily）" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(mockApi.put).toHaveBeenCalledTimes(1));
  expect(mockApi.put).toHaveBeenCalledWith(
    "/briefing/configs/3/feishu",
    expect.objectContaining({
      targets: [{ receive_id_type: "chat_id", receive_id: "oc_daily" }],
    }),
  );
});

test("groups the bot belongs to are offered for chat targets", async () => {
  mockLoad(SETTINGS, [{ chat_id: "oc_daily", name: "日报群" }]);
  render(
    <FeishuDialog open configId={1} configName="测试日报" onClose={() => {}} />,
  );
  const input = await screen.findByLabelText("群 / chat_id");
  // The bot's groups are suggestions, and the field stays typable.
  fireEvent.mouseDown(input);
  expect(await screen.findByText(/日报群/)).toBeInTheDocument();
});

test("manual push is available on the detail page once a result exists", async () => {
  mockLoad();
  mockApi.post.mockResolvedValue({
    data: {
      result: {
        ok: true,
        dry_run: false,
        sent: [{ target: "chat_id:oc_group", ok: true, message: "" }],
      },
    },
  });
  render(
    <FeishuDialog
      open
      configId={3}
      configName="测试日报"
      hasResult
      onClose={() => {}}
    />,
  );
  await screen.findByDisplayValue("oc_group");
  fireEvent.click(screen.getByRole("button", { name: "立即推送" }));
  await waitFor(() =>
    expect(mockApi.post).toHaveBeenCalledWith(
      "/briefing/configs/3/feishu/push",
    ),
  );
});

test("hides the manual push button without a generated result", async () => {
  mockLoad();
  render(
    <FeishuDialog open configId={3} configName="测试日报" onClose={() => {}} />,
  );
  await screen.findByDisplayValue("oc_group");
  expect(
    screen.queryByRole("button", { name: "立即推送" }),
  ).not.toBeInTheDocument();
});

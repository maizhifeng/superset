import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { test, expect, vi, beforeEach } from "vitest";
import ChannelConfig from "@/pages/ChannelConfig";

const { mockGet, mockPut } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
}));

vi.mock("@/api", () => ({
  default: { get: mockGet, put: mockPut, post: vi.fn() },
  QUERY_TIMEOUT_MS: 60_000,
}));

const whitelistedChannel = {
  channel_key: "1",
  channel_id: "1",
  channel_name: "Alpha",
  updated_at: "",
  白名单控制参数: "Y",
  默认分成: "",
  ios虚拟支付分成: "",
};

beforeEach(() => {
  mockGet.mockReset();
  mockPut.mockReset();
  mockGet.mockResolvedValue({ data: { result: [whitelistedChannel] } });
  mockPut.mockResolvedValue({ data: { result: whitelistedChannel } });
});

test("keeps an edited row visible after unchecking its whitelist flag", async () => {
  render(<ChannelConfig />);

  await screen.findByText("Alpha");
  fireEvent.click(screen.getByLabelText("编辑"));

  const checkbox = screen.getByRole("checkbox");
  expect(checkbox).toBeChecked();
  fireEvent.click(checkbox);

  // The only-whitelist filter must not hide the row before it can be saved.
  expect(screen.getByText("Alpha")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("保存"));

  await waitFor(() =>
    expect(mockPut).toHaveBeenCalledWith(
      "/project/channel/1",
      expect.objectContaining({ 白名单控制参数: "" }),
    ),
  );
});

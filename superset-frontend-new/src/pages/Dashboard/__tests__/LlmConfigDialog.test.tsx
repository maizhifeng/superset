import { test, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/config/llm", () => ({
  getLlmConfig: vi.fn(() => ({ baseUrl: "/llm/v1", model: "qwopus3.5-4b-v3" })),
  setLlmConfig: vi.fn(),
}));

import { getLlmConfig, setLlmConfig } from "@/config/llm";
import LlmConfigDialog from "@/pages/Dashboard/LlmConfigDialog";

beforeEach(() => {
  vi.clearAllMocks();
});

function renderDialog(open = true) {
  const onClose = vi.fn();
  const view = render(<LlmConfigDialog open={open} onClose={onClose} />);
  return { onClose, ...view };
}

test("renders nothing when closed", () => {
  renderDialog(false);
  expect(screen.queryByText("LLM 配置")).not.toBeInTheDocument();
});

test("renders dialog when open", () => {
  renderDialog(true);
  expect(screen.getByText("LLM 配置")).toBeInTheDocument();
  expect(screen.getByLabelText("API 地址")).toBeInTheDocument();
  expect(screen.getByLabelText("模型 ID")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "保存" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
});

test("populates fields from current config on open", () => {
  renderDialog(true);
  const apiInput = screen.getByLabelText("API 地址") as HTMLInputElement;
  const modelInput = screen.getByLabelText("模型 ID") as HTMLInputElement;
  expect(apiInput.value).toBe("/llm/v1");
  expect(modelInput.value).toBe("qwopus3.5-4b-v3");
});

test("calls onClose on Cancel", async () => {
  const { onClose } = renderDialog(true);
  await userEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(onClose).toHaveBeenCalled();
});

test("shows warning when saving with empty fields", async () => {
  renderDialog(true);
  const apiInput = screen.getByLabelText("API 地址");
  const modelInput = screen.getByLabelText("模型 ID");
  await userEvent.clear(apiInput);
  await userEvent.clear(modelInput);
  await userEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(setLlmConfig).not.toHaveBeenCalled();
});

test("saves config with trimmed values and trailing slash stripped", async () => {
  const { onClose } = renderDialog(true);
  const apiInput = screen.getByLabelText("API 地址");
  const modelInput = screen.getByLabelText("模型 ID");
  await userEvent.clear(apiInput);
  await userEvent.type(apiInput, "  http://host:1234/v1/  ");
  await userEvent.clear(modelInput);
  await userEvent.type(modelInput, "  custom-model  ");
  await userEvent.click(screen.getByRole("button", { name: "保存" }));
  expect(setLlmConfig).toHaveBeenCalledWith({
    baseUrl: "http://host:1234/v1",
    model: "custom-model",
  });
  expect(onClose).toHaveBeenCalled();
});

test("updates fields when dialog re-opens with new config", () => {
  vi.mocked(getLlmConfig).mockReturnValue({ baseUrl: "http://changed", model: "v2" });
  const { rerender } = render(<LlmConfigDialog open={false} onClose={vi.fn()} />);
  vi.mocked(getLlmConfig).mockReturnValue({ baseUrl: "http://new", model: "v3" });
  rerender(<LlmConfigDialog open={true} onClose={vi.fn()} />);
  const apiInput = screen.getByLabelText("API 地址") as HTMLInputElement;
  const modelInput = screen.getByLabelText("模型 ID") as HTMLInputElement;
  expect(apiInput.value).toBe("http://new");
  expect(modelInput.value).toBe("v3");
});

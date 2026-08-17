import { render, screen } from "@testing-library/react";
import SmartInput from "@/components/AiDrawer/SmartInput";
import { test, expect } from "vitest";

test("renders a textbox seeded with an initial value", () => {
  render(
    <SmartInput
      initialValue="帮我分析销量"
      onSend={() => {}}
      onStop={() => {}}
      streaming={false}
    />,
  );
  const tb = screen.getByRole("textbox");
  expect((tb as HTMLInputElement).value).toBe("帮我分析销量");
});

test("starts empty without an initial value", () => {
  render(<SmartInput onSend={() => {}} onStop={() => {}} streaming={false} />);
  const tb = screen.getByRole("textbox");
  expect((tb as HTMLInputElement).value).toBe("");
});

import { render, screen } from "@testing-library/react";
import MirrorTable from "@/pages/Dashboard/MirrorTable";
import { test, expect } from "vitest";

const baseData = {
  colnames: ["name", "value"],
  coltypes: [0, 1],
  data: [
    { name: "A", value: 1 },
    { name: "B", value: 2 },
  ],
};

function exportButton() {
  const icon = screen.getByTestId("DownloadIcon");
  return icon.closest("button") as HTMLButtonElement;
}

test("renders an enabled export button when there is mirror data", () => {
  render(<MirrorTable dimensions={[]} data={baseData} onClose={() => {}} />);
  const btn = exportButton();
  expect(btn).toBeInTheDocument();
  expect(btn).not.toBeDisabled();
  expect(btn).toHaveAttribute("aria-label", "导出为 CSV");
});

test("disables the export button when there is no data", () => {
  render(<MirrorTable dimensions={[]} data={{ data: [] }} onClose={() => {}} />);
  expect(exportButton()).toBeDisabled();
});

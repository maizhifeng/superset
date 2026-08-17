import { vi, test, expect, beforeEach } from "vitest";
import { downloadCsv } from "@/utils/exportCsv";

// jsdom 环境对 Blob/URL 的桩，让 downloadCsv 可测。
beforeEach(() => {
  vi.restoreAllMocks();
});

test("downloads a CSV with header and escaped cells", () => {
  const appendChild = vi
    .spyOn(document.body, "appendChild")
    .mockImplementation((node: Node) => node);
  const revoke = vi
    .spyOn(URL, "revokeObjectURL")
    .mockImplementation(() => {});
  const create = vi
    .spyOn(URL, "createObjectURL")
    .mockImplementation(() => "blob:fake");

  downloadCsv(
    ["name", "region", "value"],
    [
      { name: "A,B", region: 'x"y', value: 10 },
      { name: "Bob", region: "west", value: null },
    ],
    "report.csv",
  );

  // 第一个 appendChild 是 <a>；检验其 download 与触发的点击（jsdom 不执行真实下载）。
  const aEl = appendChild.mock.calls[0][0] as HTMLAnchorElement;
  expect(aEl.download).toBe("report.csv");
  // 验证生成的 CSV 内容（从 createObjectURL 拿到 blob，读取文本）。
  const blob = create.mock.calls[0][0] as Blob;
  expect(blob.type).toContain("text/csv");

  return blob.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    // 前三个字节应为 UTF-8 BOM (EF BB BF)
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
    const csv = new TextDecoder().decode(buf);
    expect(csv).toContain("name,region,value");
    expect(csv).toContain('"A,B","x""y",10');
    expect(csv).toContain("Bob,west,");
  }).then(() => new Promise((r) => setTimeout(r, 0))).then(() => {
    expect(revoke).toHaveBeenCalled();
  });
});

import { test, expect } from "vitest";
import {
  cleanTargets,
  docFolderPayloadValue,
  docFolderToken,
  emptyFeishuSettings,
  MAX_FEISHU_TARGETS,
  normalizeSettings,
  outcomeMessage,
  settingsPayload,
  targetLabel,
  validateDocFolder,
  validateTargets,
  type FeishuTarget,
} from "@/pages/Briefing/feishu";

test("normalizeSettings fills defaults for a missing payload", () => {
  const settings = normalizeSettings(null);
  expect(settings).toEqual(emptyFeishuSettings());
});

test("normalizeSettings falls back on unknown target types", () => {
  const settings = normalizeSettings({
    enabled: true,
    msg_type: "text",
    targets: [
      { receive_id_type: "phone" as never, receive_id: "123" },
      { receive_id_type: "open_id", receive_id: "ou_1" },
    ],
  });
  expect(settings.enabled).toBe(true);
  expect(settings.msg_type).toBe("text");
  expect(settings.targets).toEqual([
    { receive_id_type: "chat_id", receive_id: "123" },
    { receive_id_type: "open_id", receive_id: "ou_1" },
  ]);
});

test("normalizeSettings keeps an unknown message type as the card", () => {
  expect(normalizeSettings({ msg_type: "post" as never }).msg_type).toBe(
    "interactive",
  );
});

test("cleanTargets trims and drops blank targets", () => {
  const targets: FeishuTarget[] = [
    { receive_id_type: "chat_id", receive_id: "  oc_1  " },
    { receive_id_type: "open_id", receive_id: "   " },
  ];
  expect(cleanTargets(targets)).toEqual([
    { receive_id_type: "chat_id", receive_id: "oc_1" },
  ]);
});

test("validateTargets mirrors the backend rules", () => {
  expect(validateTargets([])).toEqual([]);
  expect(validateTargets([], true)).toEqual([
    "启用定时推送前请先配置至少一个目标",
  ]);
  expect(
    validateTargets([{ receive_id_type: "chat_id", receive_id: " " }]),
  ).toContain("推送目标不能为空");
  const many: FeishuTarget[] = Array.from(
    { length: MAX_FEISHU_TARGETS + 1 },
    () => ({ receive_id_type: "chat_id", receive_id: "oc_1" }),
  );
  expect(validateTargets(many)).toContain(
    `最多配置 ${MAX_FEISHU_TARGETS} 个推送目标`,
  );
});

test("settingsPayload sends only the writable fields", () => {
  const payload = settingsPayload({
    enabled: true,
    msg_type: "text",
    include_tables: true,
    include_doc: false,
    split_chapters: true,
    targets: [{ receive_id_type: "chat_id", receive_id: " oc_9 " }],
    doc_folder: "https://acme.feishu.cn/drive/folder/fldcnAbC123",
  });
  expect(payload).toEqual({
    enabled: true,
    msg_type: "text",
    include_tables: true,
    include_doc: false,
    split_chapters: true,
    targets: [{ receive_id_type: "chat_id", receive_id: "oc_9" }],
    doc_folder: "fldcnAbC123",
  });
});

test("settingsPayload clears the doc folder with an empty value", () => {
  const payload = settingsPayload({
    enabled: false,
    msg_type: "interactive",
    include_tables: false,
    include_doc: true,
    split_chapters: true,
    targets: [],
  });
  expect(payload.doc_folder).toBe("");
});

test("normalizeSettings keeps the daily form as the default", () => {
  const settings = normalizeSettings({});
  expect(settings.report_type).toBe("daily");
  expect(settings.weekly_doc_enabled).toBe(false);
  expect(settings.doc_folder).toBe("");
  expect(settings.doc_folder_configured).toBe(false);
});

test("normalizeSettings carries the weekly doc fields", () => {
  const settings = normalizeSettings({
    report_type: "weekly",
    weekly_doc_enabled: true,
    doc_folder: " fldcnAbC123 ",
    doc_folder_configured: true,
  });
  expect(settings.report_type).toBe("weekly");
  expect(settings.weekly_doc_enabled).toBe(true);
  expect(settings.doc_folder).toBe("fldcnAbC123");
  expect(settings.doc_folder_configured).toBe(true);
});

test("normalizeSettings derives the weekly flag from an older payload", () => {
  const settings = normalizeSettings({ report_type: "weekly" });
  expect(settings.report_type).toBe("weekly");
  expect(settings.weekly_doc_enabled).toBe(true);
});

test("normalizeSettings keeps an unknown report type as daily", () => {
  expect(
    normalizeSettings({ report_type: "monthly" as never }).report_type,
  ).toBe("daily");
});

test("docFolderToken accepts links and bare tokens only", () => {
  expect(
    docFolderToken("https://acme.feishu.cn/drive/folder/fldcnAbC123?from=copy"),
  ).toBe("fldcnAbC123");
  expect(docFolderToken("  fldcnAbC123  ")).toBe("fldcnAbC123");
  expect(docFolderToken("")).toBe("");
  expect(docFolderToken("hello world")).toBe("");
});

test("validateDocFolder allows empty input and valid folders", () => {
  expect(validateDocFolder("")).toEqual([]);
  expect(validateDocFolder("fldcnAbC123")).toEqual([]);
  expect(
    validateDocFolder("https://acme.feishu.cn/drive/folder/fldcnAbC123"),
  ).toEqual([]);
  expect(validateDocFolder("hello world")).toContain(
    "文档文件夹需填写飞书文件夹链接（含 /folder/）或文件夹 token",
  );
});

test("docFolderPayloadValue canonicalises a pasted link to its token", () => {
  expect(
    docFolderPayloadValue(" https://x.feishu.cn/drive/folder/fldcn1 "),
  ).toBe("fldcn1");
  expect(docFolderPayloadValue("fldcn1")).toBe("fldcn1");
  expect(docFolderPayloadValue("")).toBe("");
});

test("normalizeSettings carries the sub-table switch", () => {
  expect(normalizeSettings({}).include_tables).toBe(false);
  expect(normalizeSettings({ include_tables: true }).include_tables).toBe(true);
});

test("outcomeMessage reports what the 30 KB limit trimmed", () => {
  expect(
    outcomeMessage({
      ok: true,
      dry_run: false,
      sent: [
        {
          target: "chat_id:oc_1",
          ok: true,
          message: "",
          trimmed: ["子表格行数已裁剪到每表 3 行"],
        },
      ],
    }),
  ).toBe("已推送到 1 个目标（子表格行数已裁剪到每表 3 行）");
});

test("targetLabel resolves known types", () => {
  expect(targetLabel({ receive_id_type: "chat_id", receive_id: "oc_1" })).toBe(
    "群聊",
  );
  expect(targetLabel({ receive_id_type: "email", receive_id: "a@b.com" })).toBe(
    "邮箱",
  );
});

test("outcomeMessage summarises success, dry run and failures", () => {
  expect(
    outcomeMessage({
      ok: true,
      dry_run: false,
      sent: [{ target: "chat_id:oc_1", ok: true, message: "" }],
    }),
  ).toBe("已推送到 1 个目标");
  expect(outcomeMessage({ ok: true, dry_run: true, sent: [] })).toBe(
    "试运行：未实际发送",
  );
  expect(
    outcomeMessage({
      ok: false,
      dry_run: false,
      sent: [{ target: "chat_id:oc_1", ok: false, message: "机器人不在群内" }],
    }),
  ).toContain("机器人不在群内");
  expect(outcomeMessage(undefined)).toBe("推送结果未知");
});

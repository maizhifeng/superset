import { test, expect } from "vitest";
import {
  cleanTargets,
  emptyFeishuSettings,
  MAX_FEISHU_TARGETS,
  normalizeSettings,
  outcomeMessage,
  settingsPayload,
  targetLabel,
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
  });
  expect(payload).toEqual({
    enabled: true,
    msg_type: "text",
    include_tables: true,
    include_doc: false,
    split_chapters: true,
    targets: [{ receive_id_type: "chat_id", receive_id: "oc_9" }],
  });
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

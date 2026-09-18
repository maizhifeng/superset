import dayjs from "dayjs";

export const ANCHORS = [
  { key: "上线时间", label: "上线" },
  { key: "首测起始时间", label: "首测" },
  { key: "二测起始时间", label: "二测" },
  { key: "三测起始时间", label: "三测" },
] as const;

export type AnchorKey = (typeof ANCHORS)[number]["key"];

export const ANCHOR_LABELS: Record<AnchorKey, string> = {
  上线时间: "上线",
  首测起始时间: "首测",
  二测起始时间: "二测",
  三测起始时间: "三测",
};

/** 阶段先后顺序:首测 → 二测 → 三测 → 上线,用于限制各轮次窗口不超过下一阶段起始时间 */
export const ANCHOR_SEQUENCE: AnchorKey[] = [
  "首测起始时间",
  "二测起始时间",
  "三测起始时间",
  "上线时间",
];

/** 下一个阶段(最后一个阶段返回 undefined) */
export function nextAnchor(anchor: AnchorKey): AnchorKey | undefined {
  const index = ANCHOR_SEQUENCE.indexOf(anchor);
  return index >= 0 && index < ANCHOR_SEQUENCE.length - 1
    ? ANCHOR_SEQUENCE[index + 1]
    : undefined;
}

export interface ProfitSharingStartRow {
  papp_id: number | string;
  /** 游戏所属区域；国内与海外的 papp_id 可能重名，需要区分 */
  region?: string;
  channel_name: string;
  上线时间: string;
  首测起始时间: string;
  二测起始时间: string;
  三测起始时间: string;
}

/**
 * 起始日期映射的键。同一个 papp_id 可能同时存在于国内与海外（对应不同
 * 游戏），因此按「区域 + papp_id」存放；没有区域信息的行（历史数据）
 * 退化为纯 papp_id。
 */
export function startKey(
  region: string | undefined,
  pappId: string | number,
): string {
  return region ? `${region}:${pappId}` : String(pappId);
}

/** 游戏最早日期(区域+papp_id → 日期),未选渠道时兜底 */
export interface StartDatesByChannel {
  global: Record<string, string>;
  /** 各渠道日期:区域+papp_id → (渠道名 → 日期) */
  perChannel: Record<string, Record<string, string>>;
}

export type StartMaps = Record<AnchorKey, StartDatesByChannel>;

/** 按「上线/首测/二测/三测」分别聚合出各游戏的最早日期与各渠道日期 */
export function buildStartMaps(rows: ProfitSharingStartRow[]): StartMaps {
  const maps = {} as StartMaps;
  for (const { key } of ANCHORS) {
    maps[key] = { global: {}, perChannel: {} };
  }
  for (const row of rows) {
    const pid = startKey(row.region, row.papp_id);
    for (const { key } of ANCHORS) {
      const date = row[key];
      if (!date) continue;
      const parsed = dayjs(date);
      if (!parsed.isValid()) continue;
      const { global, perChannel } = maps[key];
      // 手动录入的日期可能是 2024/9/20 这种非补零格式,用日期解析比较而非字符串比较
      if (!global[pid] || parsed.isBefore(dayjs(global[pid]))) {
        global[pid] = date;
      }
      if (row.channel_name) {
        (perChannel[pid] ??= {})[row.channel_name] = date;
      }
    }
  }
  return maps;
}

/**
 * 解析某个游戏(可指定渠道)在选中轮次下的起始日期:
 * 渠道+轮次 → 轮次全游戏最早。
 *
 * 测试轮次(首测/二测/三测)不会回退到上线时间:该轮次完全没有日期时返回
 * undefined,避免只有上线时间的游戏被生成重复的轮次标签/分表。上线时间
 * 锚点本身则取上线时间。
 */
export function resolveStartDate(
  maps: StartMaps,
  anchorKey: AnchorKey,
  pappId: string,
  channelName?: string,
): string | undefined {
  const anchor = maps[anchorKey];
  return (
    (channelName ? anchor.perChannel[pappId]?.[channelName] : undefined) ||
    anchor.global[pappId]
  );
}

/**
 * 下一阶段里程碑日期:该阶段没有自己的日期时回退到上线时间,
 * 仅用于限制窗口结束时间,不用于决定是否生成分表。
 */
export function resolveMilestoneDate(
  maps: StartMaps,
  anchorKey: AnchorKey,
  pappId: string,
  channelName?: string,
): string | undefined {
  const own = resolveStartDate(maps, anchorKey, pappId, channelName);
  if (own) return own;
  if (anchorKey !== "上线时间") {
    return resolveStartDate(maps, "上线时间", pappId, channelName);
  }
  return undefined;
}

/** 任一锚点(含上线时间)有日期的游戏才可参与对比 */
export function hasAnyStart(maps: StartMaps, pappId: string): boolean {
  return ANCHORS.some(({ key }) => Boolean(maps[key].global[pappId]));
}

/**
 * 分表/标签排序:按数据(窗口起始)日期先后;同日按阶段顺序
 * (首测 → 二测 → 三测 → 上线),再按标签稳定排序。
 */
export function compareSectionOrder(
  a: { start?: string; anchor: AnchorKey; label: string },
  b: { start?: string; anchor: AnchorKey; label: string },
): number {
  const aMs = a.start ? dayjs(a.start).valueOf() : Number.MAX_SAFE_INTEGER;
  const bMs = b.start ? dayjs(b.start).valueOf() : Number.MAX_SAFE_INTEGER;
  if (aMs !== bMs) return aMs - bMs;
  const stageDiff =
    ANCHOR_SEQUENCE.indexOf(a.anchor) - ANCHOR_SEQUENCE.indexOf(b.anchor);
  if (stageDiff !== 0) return stageDiff;
  return a.label.localeCompare(b.label);
}

export interface DateWindow {
  start: string;
  end: string;
}

/**
 * 解析某游戏(可指定渠道)在指定轮次下的对比窗口(前闭后开 [start, end)):
 * start = 该轮次自己的起始日期(渠道 → 全游戏,无日期时返回 undefined),
 * end = start + periodDays(不含),且不超过下一阶段(首测→二测→三测→上线)
 * 的起始日期(下一阶段缺失时回退到上线时间;同样不含),即首测窗口不包含
 * 二测起始当天。
 */
export function resolveStartWindow(
  maps: StartMaps,
  anchorKey: AnchorKey,
  pappId: string,
  periodDays: number,
  channelName?: string,
): DateWindow | undefined {
  const startDate = resolveStartDate(maps, anchorKey, pappId, channelName);
  if (!startDate) return undefined;
  const start = dayjs(startDate);
  if (!start.isValid()) return undefined;
  let end = start.add(periodDays, "day");
  const next = nextAnchor(anchorKey);
  if (next) {
    const nextDate = resolveMilestoneDate(maps, next, pappId, channelName);
    if (nextDate) {
      const nextStart = dayjs(nextDate);
      if (nextStart.isValid() && nextStart.isAfter(start)) {
        if (nextStart.isBefore(end)) end = nextStart;
      }
    }
  }
  return {
    start: start.format("YYYY/MM/DD"),
    end: end.format("YYYY/MM/DD"),
  };
}

/**
 * 分表标签:选中多个轮次时,每个轮次的分表都加上轮次前缀,
 * 以便与 sectionAggregateCacheRef 的 key 保持一致。
 */
export function anchorSectionLabel(
  anchor: AnchorKey,
  label: string,
  multi: boolean,
): string {
  return multi ? `${ANCHOR_LABELS[anchor]} · ${label}` : label;
}

/**
 * Game regions. Domestic and oversea games live in different source tables and
 * may reuse the same papp_id with different names, so game configuration is
 * always scoped by region.
 */
export type GameRegion = "domestic" | "oversea";

export const GAME_REGIONS: GameRegion[] = ["domestic", "oversea"];

export const REGION_LABELS: Record<GameRegion, string> = {
  domestic: "国内",
  oversea: "海外",
};

export interface GameSource {
  region: GameRegion;
  /** Superset database id holding the source table */
  databaseId: number;
  schema: string;
  table: string;
}

export const GAME_SOURCES: Record<GameRegion, GameSource> = {
  domestic: {
    region: "domestic",
    databaseId: 2,
    schema: "sj_platform",
    table: "part_papp",
  },
  oversea: {
    region: "oversea",
    databaseId: 4,
    schema: "xh_osdata_manage",
    table: "part_papp",
  },
};

export function isGameRegion(value: string | null): value is GameRegion {
  return value === "domestic" || value === "oversea";
}

export interface ChannelSource {
  region: GameRegion;
  /** Superset database id holding the source table */
  databaseId: number;
  schema: string;
  table: string;
  /** SQL returning channel_key / channel_name / updated_at per channel */
  sql: string;
}

export const CHANNEL_SOURCES: Record<GameRegion, ChannelSource> = {
  domestic: {
    region: "domestic",
    databaseId: 2,
    schema: "sj_platform",
    table: "part_channel",
    sql: "SELECT cch_id, cch_name, updated_at FROM sj_platform.part_channel",
  },
  oversea: {
    region: "oversea",
    databaseId: 4,
    schema: "overseas_report_data",
    table: "ad_operate_data_report",
    // 海外渠道没有数字 id，直接用 system 平台标识作为渠道
    sql: "SELECT system, MAX(update_time) AS updated_at FROM overseas_report_data.ad_operate_data_report GROUP BY system",
  },
};

export interface ChannelPayload {
  channel_key: string;
  channel_id: number | null;
  channel_name: string;
  updated_at: string;
}

/** Map a source table row to the payload the bulk channel endpoint expects. */
export function channelPayload(
  region: GameRegion,
  raw: Record<string, unknown>,
): ChannelPayload | null {
  if (region === "domestic") {
    const channelId = Number(raw.cch_id);
    if (!channelId) return null;
    return {
      channel_key: String(channelId),
      channel_id: channelId,
      channel_name: String(raw.cch_name ?? ""),
      updated_at: String(raw.updated_at ?? ""),
    };
  }
  const system = String(raw.system ?? "").trim();
  if (!system) return null;
  return {
    channel_key: system,
    channel_id: null,
    channel_name: system,
    updated_at: String(raw.updated_at ?? ""),
  };
}

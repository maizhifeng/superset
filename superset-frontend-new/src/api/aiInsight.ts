/**
 * AI Insight — REST API data fetching + opencode SDK event stream.
 */

import api from "@/api";
import { createOpencodeClient } from "@opencode-ai/sdk";
interface ModelConfig {
  provider: string;
  model: string;
}

/** SDK client — baseUrl 末尾加 / 确保 Vite proxy 路径正确拼接 */
const oc = createOpencodeClient({ baseUrl: "http://localhost:9000/opencode/" });

export interface InsightCallbacks {
  onText: (text: string) => void;
  onReasoning?: (text: string) => void;
  onToolCall?: (tool: string) => void;
  onToolResult?: (tool: string) => void;
  onStatus?: (status: string) => void;
  onSession?: (sessionId: string) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
}

// --- Chart data helpers ---

function parseChartInfo(resp: Record<string, unknown>) {
  const r = (resp.result || {}) as Record<string, unknown>;
  let params: Record<string, unknown> = {};
  try { params = JSON.parse((r.params as string) || "{}"); } catch { /* */ }
  const fd = (r.form_data as Record<string, unknown>) || params;
  return {
    dsId: (r.datasource_id as number) || (fd.datasource_id as number) || 0,
    dsType: (r.datasource_type as string) || (fd.datasource_type as string) || "table",
    metrics: (fd.metrics as unknown[]) || [],
    groupby: ((fd.groupby as string[]) || []).map(String),
    vizType: (r.viz_type as string) || (fd.viz_type as string) || "",
    name: (r.slice_name as string) || `#${r.id}`,
  };
}

type FilterMeta = { value?: unknown; column?: string; filterType?: string };
function buildFilterInfo(filters: Record<string, unknown>) {
  const lines: string[] = [];
  const qf: Record<string, unknown>[] = [];
  for (const [, v] of Object.entries(filters)) {
    const i = v as FilterMeta;
    if (i.filterType === "time_range" && Array.isArray(i.value) && i.value.length >= 2 && i.column) {
      lines.push(`  ${i.column}: ${i.value[0]} ~ ${i.value[1]}`);
      qf.push({ col: i.column, op: ">=", val: i.value[0] });
      qf.push({ col: i.column, op: "<=", val: i.value[1] });
    } else if (i.filterType === "filter_select" && i.column) {
      const arr = Array.isArray(i.value) ? i.value : [i.value];
      lines.push(`  ${i.column} IN [${arr.join(", ")}]`);
      qf.push({ col: i.column, op: "IN", val: arr });
    }
  }
  return { text: lines.length ? "当前筛选条件:\n" + lines.join("\n") : "", query: qf };
}

// --- OpenCode SDK event streaming ---

function _yieldToReact(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

async function _streamSession(sessionId: string, events: Awaited<ReturnType<typeof oc.event.subscribe>>, callbacks: InsightCallbacks, signal?: AbortSignal) {
  let hadTextDelta = false;
  for await (const event of events.stream) {
    if (signal?.aborted) break;

    const type = event.type as string;
    const props = (event.properties || {}) as Record<string, unknown>;
    if (props.sessionID !== sessionId) continue;

    switch (type) {
      case "tool_call":
        callbacks.onToolCall?.(((props.tool as Record<string, unknown>)?.name as string) || "");
        break;
      case "tool_result":
        callbacks.onToolResult?.(((props.tool as Record<string, unknown>)?.name as string) || "");
        break;
      case "message.part.updated": {
        const part = (props.part || {}) as Record<string, unknown>;
        if (part.type === "reasoning") {
          if ((props.delta as string) && callbacks.onReasoning) {
            callbacks.onReasoning(props.delta as string);
          } else if (part.text) {
            callbacks.onReasoning?.(part.text as string);
          }
        } else if (part.type === "text" && part.text && !hadTextDelta) {
          callbacks.onText(part.text as string);
          await _yieldToReact();
        }
        break;
      }
      case "message.part.delta": {
        if ((props.field as string) === "reasoning" && (props.delta as string)) {
          callbacks.onReasoning?.(props.delta as string);
        } else if ((props.field as string) === "text" && props.delta) {
          hadTextDelta = true;
          callbacks.onText(props.delta as string);
          await _yieldToReact();
        }
        break;
      }
      case "session.status": {
        const st = ((props.status || {}) as Record<string, unknown>).type as string;
        if (st === "idle") { callbacks.onDone?.(); return; }
        if (st === "error") {
          callbacks.onError?.(((props.status as Record<string, unknown>)?.message as string) || "Unknown error");
          return;
        }
        break;
      }
      case "session.error":
        callbacks.onError?.((props.error as string) || "Session error");
        return;
    }
  }
}

/** Send prompt via raw fetch (SDK can't resolve /opencode proxy path) */
async function _sendPrompt(sessionId: string, body: Record<string, unknown>, modelCfg?: ModelConfig) {
  const payload = { ...body } as Record<string, unknown>;
  if (modelCfg) {
    payload.model = { providerID: modelCfg.provider, modelID: modelCfg.model };
  }
  const res = await fetch(`/opencode/session/${sessionId}/prompt_async`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Send prompt failed: ${res.status}`);
}

/** Create session via raw fetch */
async function _createSession(title: string): Promise<string> {
  const res = await fetch("/opencode/session", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`Create session failed: ${res.status}`);
  return (await res.json()).id;
}

// --- Public API ---

export async function streamChartInsight(
  chartId: number, filters: Record<string, unknown>,
  callbacks: InsightCallbacks, signal?: AbortSignal,
  modelCfg?: ModelConfig,
): Promise<string> {
  callbacks.onStatus?.("正在获取图表元数据…");
  const infoResp = await api.get(`/chart/${chartId}`, { signal }).catch((e: Error) => {
    throw new Error(`获取图表信息失败: ${e.message}`);
  });
  const info = parseChartInfo(infoResp.data);
  if (!info.dsId) throw new Error("图表数据源 ID 为空");
  const fi = buildFilterInfo(filters);

  callbacks.onStatus?.("正在查询数据…");
  try {
    const payload: Record<string, unknown> = {
      datasource: { id: info.dsId, type: info.dsType },
      queries: [{
        metrics: info.metrics.slice(0, 10),
        columns: info.groupby.slice(0, 5),
      }],
      result_format: "json", result_type: "full",
    };
    if (fi.query.length) (payload.queries as Record<string, unknown>[])[0].filters = fi.query;

    const dataResp = await api.post("/chart/data", payload, { signal });
    const first = (Array.isArray(dataResp.data?.result) ? dataResp.data.result[0] : dataResp.data?.result) || {};
    const data: Record<string, unknown>[] = first.data || [];
    const colnames: string[] = first.colnames || [];

    callbacks.onStatus?.("数据获取完成");
    callbacks.onStatus?.("正在分析…");

    /* Format as a readable table (chart SQL is already aggregated) */
    const shortNames = colnames.map((c: string) =>
      c.replace(/^SUM\(/, "").replace(/\)$/, ""),
    );
    const sorted = [...data].sort((a, b) => {
      const va = Number(Object.values(a).find((v) => typeof v === "number")) || 0;
      const vb = Number(Object.values(b).find((v) => typeof v === "number")) || 0;
      return vb - va;
    });
    const tableStr = [
      shortNames.join("\t"),
      ...sorted.map((r) => shortNames.map((_, i) => {
        const v = r[colnames[i]];
        return v == null ? "-" : (typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : String(v));
      }).join("\t")),
    ].join("\n");

    const contextLines = [`图表: ${info.name}`, `类型: ${info.vizType}`,
      `数据行: ${data.length}`, `数据列: ${shortNames.join(", ")}`,
    ];
    if (fi.text) contextLines.push(`\n${fi.text}`);
    const dataBlock = data.length ? `\n数据:\n${tableStr}` : "";
    const instruction = `分析图表 #${chartId} 的数据。\n\n图表上下文:\n${contextLines.join("\n")}${dataBlock}`;

    const sessionId = await _createSession(`Chart #${chartId} Insight`);
    callbacks.onSession?.(sessionId);

    // Subscribe to events BEFORE sending prompt (no buffered events to miss)
    const events = await oc.event.subscribe();

    await _sendPrompt(sessionId, { parts: [{ type: "text", text: instruction }] }, modelCfg);
    await _streamSession(sessionId, events, callbacks, signal);
    return sessionId;

  } catch (e: unknown) {
    if ((e as Error).name === "AbortError") throw e;
    callbacks.onStatus?.("REST API 失败，尝试 MCP 回退…");
    return await _fallbackViaMCP(chartId, fi, callbacks, signal, modelCfg);
  }
}

async function _fallbackViaMCP(
  chartId: number, fi: ReturnType<typeof buildFilterInfo>,
  callbacks: InsightCallbacks, signal?: AbortSignal,
  modelCfg?: ModelConfig,
): Promise<string> {
  const sessionId = await _createSession(`Chart #${chartId} Insight`);
  callbacks.onSession?.(sessionId);
  const events = await oc.event.subscribe();
  const extraFormJSON = fi.query.length ? JSON.stringify({ filters: fi.query }) : "";
  const msg = `分析图表 #${chartId}。先 get_chart_info(request={"identifier": ${chartId}})，` +
    `再 get_chart_sql(request={"identifier": ${chartId}})，` +
    `最后 get_chart_data(request={"identifier": ${chartId}, "limit": 30` +
    (extraFormJSON ? `, "extra_form_data": ${extraFormJSON}` : "") + `})。`;
  await _sendPrompt(sessionId, { parts: [{ type: "text", text: msg }] }, modelCfg);
  await _streamSession(sessionId, events, callbacks, signal);
  return sessionId;
}

export async function streamChat(
  sessionId: string, message: string,
  callbacks: InsightCallbacks, signal?: AbortSignal,
  modelCfg?: ModelConfig,
) {
  const events = await oc.event.subscribe();
  await _sendPrompt(sessionId, { parts: [{ type: "text", text: message }] }, modelCfg);
  await _streamSession(sessionId, events, callbacks, signal);
}

export async function abortSession(sessionId: string) {
  try { await fetch(`/opencode/session/${sessionId}/abort`, { method: "POST" }); } catch { /* */ }
}

export async function streamDirectChat(
  prompt: string,
  systemPrompt: string,
  callbacks: InsightCallbacks,
  signal?: AbortSignal,
  modelCfg?: ModelConfig,
): Promise<string> {
  callbacks.onStatus?.("正在创建会话…");
  const sessionId = await _createSession("AI Chat");
  callbacks.onSession?.(sessionId);
  const events = await oc.event.subscribe();
  const payload: Record<string, unknown> = {
    parts: [
      { type: "text", text: `[System Instructions]\n${systemPrompt}\n\n${prompt}` },
    ],
  };
  if (modelCfg) {
    payload.model = { providerID: modelCfg.provider, modelID: modelCfg.model };
  }
  callbacks.onStatus?.("正在获取回答…");
  await _sendPrompt(sessionId, payload, modelCfg);
  await _streamSession(sessionId, events, callbacks, signal);
  return sessionId;
}

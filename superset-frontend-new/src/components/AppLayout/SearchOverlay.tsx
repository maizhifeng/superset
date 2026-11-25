/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import CircularProgress from "@mui/material/CircularProgress";
import SearchIcon from "@mui/icons-material/Search";
import DashboardIcon from "@mui/icons-material/Dashboard";
import BarChartIcon from "@mui/icons-material/BarChart";
import TableChartIcon from "@mui/icons-material/TableChart";
import SettingsIcon from "@mui/icons-material/Settings";
import CodeIcon from "@mui/icons-material/Code";
import ExtensionIcon from "@mui/icons-material/Extension";
import HistoryIcon from "@mui/icons-material/History";
import StorageIcon from "@mui/icons-material/Storage";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import api from "@/api";
import { useRecentDashboards } from "@/store/recentDashboards";
import { useRecentCharts } from "@/store/recentCharts";
import { useAuthStore } from "@/store/authStore";
import { readRecentSqlQueries } from "@/utils/recentSql";
import rison from "rison";

interface SearchOverlayProps {
  open: boolean;
  query: string;
  onClose: () => void;
  onQueryChange: (q: string) => void;
}

interface Hit {
  kind:
    | "dashboard"
    | "chart"
    | "dataset"
    | "database"
    | "saved_query"
    | "sql"
    | "command";
  id: number;
  title: string;
  meta?: string;
  sql?: string;
}

/** 静态导航命令：在结果中始终置顶，便于快速跳转到常用模块。 */
interface CommandEntry {
  id: number;
  title: string;
  meta?: string;
  path: string;
  icon: React.ReactElement;
}

const COMMANDS: CommandEntry[] = [
  {
    id: 1,
    title: "新建图表",
    meta: "开始构建图表",
    path: "/explore",
    icon: <BarChartIcon sx={{ fontSize: 18, color: "primary.main" }} />,
  },
  {
    id: 2,
    title: "SQL 实验室",
    meta: "编写并运行 SQL",
    path: "/sqllab",
    icon: <CodeIcon sx={{ fontSize: 18, color: "secondary.main" }} />,
  },
  {
    id: 3,
    title: "查询历史",
    meta: "查看过往查询",
    path: "/query_history",
    icon: <HistoryIcon sx={{ fontSize: 18, color: "error.main" }} />,
  },
  {
    id: 4,
    title: "设置",
    meta: "导航、表格密度等",
    path: "/settings",
    icon: <SettingsIcon sx={{ fontSize: 18, color: "text.secondary" }} />,
  },
  {
    id: 5,
    title: "系统管理",
    meta: "用户与角色管理",
    path: "/system/admin",
    icon: <ExtensionIcon sx={{ fontSize: 18, color: "warning.main" }} />,
  },
  {
    id: 6,
    title: "仪表板",
    meta: "浏览全部仪表板",
    path: "/dashboard/list",
    icon: <DashboardIcon sx={{ fontSize: 18, color: "success.main" }} />,
  },
  {
    id: 7,
    title: "图表",
    meta: "浏览全部图表",
    path: "/chart/list",
    icon: <BarChartIcon sx={{ fontSize: 18, color: "primary.main" }} />,
  },
  {
    id: 8,
    title: "数据集",
    meta: "浏览全部数据集",
    path: "/dataset/list",
    icon: <TableChartIcon sx={{ fontSize: 18, color: "info.main" }} />,
  },
  {
    id: 9,
    title: "数据库",
    meta: "浏览全部数据库",
    path: "/database/list",
    icon: <StorageIcon sx={{ fontSize: 18, color: "warning.main" }} />,
  },
  {
    id: 10,
    title: "保存的查询",
    meta: "浏览保存的 SQL 查询",
    path: "/saved_query/list",
    icon: <BookmarkIcon sx={{ fontSize: 18, color: "secondary.main" }} />,
  },
];

const SEARCH_DEBOUNCE_MS = 250;

function iconFor(kind: Hit["kind"]) {
  switch (kind) {
    case "dashboard":
      return <DashboardIcon sx={{ fontSize: 18, color: "success.main" }} />;
    case "chart":
      return <BarChartIcon sx={{ fontSize: 18, color: "primary.main" }} />;
    case "dataset":
      return <TableChartIcon sx={{ fontSize: 18, color: "info.main" }} />;
    case "database":
      return <StorageIcon sx={{ fontSize: 18, color: "warning.main" }} />;
    case "saved_query":
      return <BookmarkIcon sx={{ fontSize: 18, color: "secondary.main" }} />;
    case "sql":
      return <CodeIcon sx={{ fontSize: 18, color: "secondary.main" }} />;
    default:
      return <ExtensionIcon sx={{ fontSize: 18, color: "primary.main" }} />;
  }
}

const LABELS: Record<Hit["kind"], string> = {
  dashboard: "仪表板",
  chart: "图表",
  dataset: "数据集",
  database: "数据库",
  saved_query: "保存的查询",
  sql: "最近的查询",
  command: "命令",
};

const KEY_ORDER: Hit["kind"][] = [
  "command",
  "dashboard",
  "chart",
  "dataset",
  "database",
  "saved_query",
];

/**
 * 全局搜索命令面板：按名称实时搜索仪表板、图表、数据集，点击结果直接跳转。
 */
export default function SearchOverlay({
  open,
  query,
  onClose,
  onQueryChange,
}: SearchOverlayProps) {
  const navigate = useNavigate();
  const recentDbs = useRecentDashboards((s) => s.items);
  const recentCharts = useRecentCharts((s) => s.items);
  const username = useAuthStore((state) => state.user?.username ?? "");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const [recentHits, setRecentHits] = useState<Hit[]>([]);
  const [recentSqlQueries, setRecentSqlQueries] = useState<string[]>([]);
  const listboxId = useId();

  const trimmed = query.trim();

  useEffect(() => {
    if (!open || trimmed) {
      setRecentSqlQueries([]);
      return;
    }
    setRecentSqlQueries(readRecentSqlQueries(username).slice(0, 3));
  }, [open, trimmed, username]);

  // 静态命令：按键入词过滤并始终展示，支持键盘导航跳转到常用模块。
  const commandHits = useMemo(() => {
    if (!trimmed) return [];
    const q = trimmed.toLowerCase();
    return COMMANDS.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.meta ?? "").toLowerCase().includes(q),
    ).map<Hit>((c) => ({
      kind: "command",
      id: c.id,
      title: c.title,
      meta: c.meta,
    }));
  }, [trimmed]);

  // 空查询时展示"最近访问"的仪表板/图表作为快捷入口。
  useEffect(() => {
    if (!open || trimmed) {
      setRecentHits([]);
      return;
    }
    const controller = new AbortController();
    const tasks: Promise<Hit | null>[] = [];
    for (let i = 0; i < Math.min(recentDbs.length, 4); i += 1) {
      const it = recentDbs[i];
      tasks.push(
        api
          .get<{ result: { dashboard_title?: string } }>(
            `/dashboard/${it.id}`,
            {
              signal: controller.signal,
            },
          )
          .then((res): Hit | null => ({
            kind: "dashboard",
            id: it.id,
            title: res.data.result?.dashboard_title ?? `仪表板 ${it.id}`,
          }))
          .catch(() => null),
      );
    }
    for (let i = 0; i < Math.min(recentCharts.length, 4); i += 1) {
      const it = recentCharts[i];
      tasks.push(
        api
          .get<{ result: { slice_name?: string } }>(`/chart/${it.id}`, {
            signal: controller.signal,
          })
          .then((res): Hit | null => ({
            kind: "chart",
            id: it.id,
            title: res.data.result?.slice_name ?? `图表 ${it.id}`,
          }))
          .catch(() => null),
      );
    }
    if (tasks.length === 0) {
      setRecentHits([]);
      return;
    }
    Promise.all(tasks)
      .then((res) => {
        if (!controller.signal.aborted) {
          setRecentHits(res.filter((x): x is Hit => x != null));
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setRecentHits([]);
      });
    return () => controller.abort();
  }, [open, trimmed, recentDbs, recentCharts]);

  // 防抖实时搜索。
  useEffect(() => {
    if (!open) return;
    if (!trimmed) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      Promise.all([
        runSearch("dashboard", "dashboard_title", trimmed, controller),
        runSearch("chart", "slice_name", trimmed, controller),
        runSearch("dataset", "table_name", trimmed, controller),
        runSearch("database", "database_name", trimmed, controller),
        runSearch("saved_query", "label", trimmed, controller),
      ])
        .then((groups) => {
          if (controller.signal.aborted) return;
          setHits(groups.flat().slice(0, 24));
        })
        .catch(() => {
          if (!controller.signal.aborted) setHits([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, trimmed]);

  function runSearch(
    kind: Hit["kind"],
    col: string,
    value: string,
    controller: AbortController,
  ): Promise<Hit[]> {
    const qs = rison.encode({
      filters: [{ col, opr: "ct", value }],
      page_size: 8,
      page: 0,
    });
    return api
      .get<{ result: Record<string, unknown>[] }>(`/${kind}/?q=${qs}`, {
        signal: controller.signal,
      })
      .then((res) =>
        res.data.result.map((r) => {
          const title = String(
            r.dashboard_title ??
              r.slice_name ??
              r.table_name ??
              r.database_name ??
              r.label ??
              "",
          );
          const meta = String(
            kind === "dashboard"
              ? (r.changed_on_delta_humanized ?? "")
              : kind === "chart"
                ? (r.viz_type ?? "")
                : kind === "dataset"
                  ? ((r.database as { database_name?: string } | undefined)
                      ?.database_name ?? "")
                  : kind === "database"
                    ? ((r.backend as string | undefined) ?? "")
                    : kind === "saved_query"
                      ? ((r.database as { database_name?: string } | undefined)
                          ?.database_name ?? "")
                      : "",
          );
          return { kind, id: Number(r.id), title, meta };
        }),
      )
      .catch(() => []);
  }

  const groupedHits = useMemo(() => {
    const out: Record<Hit["kind"], Hit[]> = {
      command: [],
      dashboard: [],
      chart: [],
      dataset: [],
      database: [],
      saved_query: [],
      sql: [],
    };
    for (const c of commandHits) out.command.push(c);
    for (const h of hits) out[h.kind].push(h);
    return out;
  }, [hits, commandHits]);

  const recentSqlHits = useMemo<Hit[]>(
    () =>
      recentSqlQueries.map((sql, index) => ({
        kind: "sql",
        id: index,
        title: sql.split("\n").filter(Boolean).join(" ").slice(0, 80) || sql,
        sql,
      })),
    [recentSqlQueries],
  );

  const flatHits = useMemo(
    () =>
      trimmed
        ? KEY_ORDER.flatMap((kind) => groupedHits[kind])
        : [...recentHits, ...recentSqlHits],
    [trimmed, groupedHits, recentHits, recentSqlHits],
  );
  const hasAny = flatHits.length > 0;

  // 结果变化时重置高亮。
  const [highlightIndex, setHighlightIndex] = useState(-1);
  useEffect(() => {
    setHighlightIndex(-1);
  }, [flatHits.length, query]);

  const moveHighlight = (delta: number) => {
    if (flatHits.length === 0) return;
    setHighlightIndex((prev) => {
      const next = prev + delta;
      if (next < 0) return flatHits.length - 1;
      if (next >= flatHits.length) return 0;
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (hasAny) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveHighlight(1);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveHighlight(-1);
        return;
      }
      if (e.key === "Enter" && highlightIndex >= 0) {
        e.preventDefault();
        const target = flatHits[highlightIndex];
        if (target) goTo(target);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const target = flatHits[0];
        if (target) goTo(target);
        return;
      }
    }
  };

  const goTo = (h: Hit) => {
    onClose();
    switch (h.kind) {
      case "dashboard":
        navigate(`/dashboard/${h.id}`);
        break;
      case "chart":
        navigate(`/explore?slice_id=${h.id}`);
        break;
      case "dataset":
        navigate(`/dataset/edit/${h.id}`);
        break;
      case "database":
        navigate(`/database/${h.id}`);
        break;
      case "saved_query": {
        api
          .get<{ result?: { sql?: string } }>(`/saved_query/${h.id}`)
          .then((res) => {
            navigate("/sqllab", {
              state: { initialSql: res.data.result?.sql ?? "" },
            });
          })
          .catch(() => navigate("/saved_query/list"));
        break;
      }
      case "sql":
        navigate("/sqllab", { state: { initialSql: h.sql ?? "" } });
        break;
      case "command": {
        const cmd = COMMANDS.find((c) => c.id === h.id);
        if (cmd) navigate(cmd.path);
        break;
      }
    }
  };

  const optionId = (hit: Hit) => `${listboxId}-${hit.kind}-${hit.id}`;
  const activeHit =
    open && !loading && highlightIndex >= 0
      ? flatHits[highlightIndex]
      : undefined;
  const renderOption = (hit: Hit) => {
    const flatIdx = flatHits.indexOf(hit);
    const active = flatIdx === highlightIndex;
    return (
      <ListItemButton
        key={`${hit.kind}-${hit.id}`}
        id={optionId(hit)}
        role="option"
        aria-selected={active}
        tabIndex={-1}
        dense
        selected={active}
        onClick={() => goTo(hit)}
        onMouseMove={() => setHighlightIndex(flatIdx)}
        ref={(el) => {
          if (el && active) el.scrollIntoView?.({ block: "nearest" });
        }}
        sx={{ borderRadius: 1.5 }}
      >
        <ListItemIcon sx={{ minWidth: 30 }}>
          {hit.kind === "command"
            ? (COMMANDS.find((c) => c.id === hit.id)?.icon ?? iconFor(hit.kind))
            : iconFor(hit.kind)}
        </ListItemIcon>
        <ListItemText
          primary={
            <Typography
              variant="body2"
              sx={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: hit.kind === "sql" ? "monospace" : undefined,
              }}
            >
              {hit.title}
            </Typography>
          }
          secondary={hit.meta}
          slotProps={{ secondary: { sx: { fontSize: "0.7rem" } } }}
        />
      </ListItemButton>
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: {
          sx: {
            position: "fixed",
            top: "20vh",
            m: 0,
            borderRadius: 2,
            width: "90%",
            maxWidth: 560,
          },
        },
        backdrop: { sx: { bgcolor: "var(--mui-palette-shadow-backdrop)" } },
      }}
    >
      <DialogContent sx={{ p: 2, pt: 2 }} onClick={onClose}>
        <Box onClick={(e) => e.stopPropagation()}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            variant="outlined"
            placeholder="搜索仪表板、图表、数据集..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon
                      sx={{ fontSize: 20, color: "text.secondary" }}
                    />
                  </InputAdornment>
                ),
                endAdornment: loading ? (
                  <CircularProgress size={16} aria-label="正在搜索" />
                ) : undefined,
              },
              htmlInput: {
                "aria-label": "全局搜索",
                role: "combobox",
                "aria-autocomplete": "list",
                "aria-expanded": open,
                "aria-controls": listboxId,
                "aria-activedescendant": activeHit
                  ? optionId(activeHit)
                  : undefined,
              },
            }}
          />
          {open && (
            <List
              id={listboxId}
              role="listbox"
              aria-label="搜索建议"
              dense
              sx={{ maxHeight: 360, overflow: "auto", pt: 1 }}
            >
              {trimmed && loading ? (
                <Box sx={{ px: 1, py: 2, textAlign: "center" }} role="status">
                  <Typography variant="body2" color="text.secondary">
                    正在搜索…
                  </Typography>
                </Box>
              ) : trimmed ? (
                hasAny ? (
                  KEY_ORDER.flatMap((kind) => {
                    const items = groupedHits[kind];
                    if (items.length === 0) return [];
                    return [
                      <Box
                        key={kind}
                        role="presentation"
                        sx={{ px: 1, pt: 1.25, pb: 0.25 }}
                      >
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ fontWeight: 600, letterSpacing: "0.03em" }}
                        >
                          {LABELS[kind]} · {items.length}
                        </Typography>
                      </Box>,
                      ...items.map(renderOption),
                    ];
                  })
                ) : (
                  <Box sx={{ px: 1, py: 2, textAlign: "center" }} role="status">
                    <Typography variant="body2" color="text.secondary">
                      没有匹配结果
                    </Typography>
                  </Box>
                )
              ) : (
                <>
                  {recentHits.length > 0 && (
                    <Box role="presentation" sx={{ px: 1, pt: 0.5, pb: 0.25 }}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block", fontWeight: 600 }}
                      >
                        最近访问
                      </Typography>
                    </Box>
                  )}
                  {recentHits.map(renderOption)}
                  {recentSqlHits.length > 0 && (
                    <Box role="presentation" sx={{ px: 1, pt: 1, pb: 0.25 }}>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ display: "block", fontWeight: 600 }}
                      >
                        最近的查询
                      </Typography>
                    </Box>
                  )}
                  {recentSqlHits.map(renderOption)}
                </>
              )}
            </List>
          )}
          {open && (
            <Box
              sx={{
                mt: 1.5,
                pt: 1,
                borderTop: "1px solid",
                borderColor: "divider",
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                color: "text.disabled",
                fontSize: "0.7rem",
                flexWrap: "wrap",
              }}
            >
              <Box component="span">↑↓ 选择</Box>
              <Box component="span">Enter 打开</Box>
              <Box component="span">Esc 关闭</Box>
              {!trimmed && (
                <Box component="span" sx={{ ml: "auto" }}>
                  输入以搜索仪表板、图表、数据集
                </Box>
              )}
            </Box>
          )}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

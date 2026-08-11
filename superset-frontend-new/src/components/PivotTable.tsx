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
import { useMemo, useState, type ReactNode } from "react";
import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import UnfoldLessIcon from "@mui/icons-material/UnfoldLess";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import {
  buildPivotGrid,
  MAX_PIVOT_COLS,
  MAX_PIVOT_ROWS,
  type PivotTableProps,
} from "@/utils/pivot";
import { formatDateValue } from "@/utils/dateHeuristics";

export { type PivotTableProps } from "@/utils/pivot";

function mergeConsecutive(labels: string[]): { label: string; span: number }[] {
  const groups: { label: string; span: number }[] = [];
  for (const label of labels) {
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.span += 1;
    } else {
      groups.push({ label, span: 1 });
    }
  }
  return groups;
}

interface PivotGroup {
  level: number;
  /** Dimension values from level 0 up to this group's level. */
  keyTuple: string[];
  /** Unique collapse key: level + ancestor values. */
  collapseKey: string;
  /** Leaf row indices under this group. */
  rows: number[];
  /** Sub-groups at the next level (empty for leaf groups). */
  children: PivotGroup[];
}

function buildTree(
  level: number,
  indices: number[],
  ancestors: string[],
  rowHeaders: string[][],
): PivotGroup[] {
  // Group by key with a map instead of relying on consecutive rows: the 95%
  // mode sorts rows by the split metric, so same-key rows are no longer
  // adjacent and must still collapse into a single group.
  const byKey = new Map<string, PivotGroup>();
  for (const i of indices) {
    const key = rowHeaders[level]?.[i] ?? "";
    let group = byKey.get(key);
    if (!group) {
      group = {
        level,
        keyTuple: [...ancestors, key],
        collapseKey: `${level}:${[...ancestors, key].join("\u0000")}`,
        rows: [],
        children: [],
      };
      byKey.set(key, group);
    }
    group.rows.push(i);
  }
  const result = [...byKey.values()];
  if (level < rowHeaders.length - 1) {
    for (const group of result) {
      group.children = buildTree(
        level + 1,
        group.rows,
        group.keyTuple,
        rowHeaders,
      );
    }
  }
  return result;
}

export default function PivotTable(props: PivotTableProps) {
  const { formatCell, dateColumns, pct95, data } = props;
  const theme = useTheme();
  const boundaryColor = theme.palette.divider;
  const boundaryStyle = {
    borderLeft: "2px solid",
    borderLeftColor: boundaryColor,
  };

  // Date dimension values are formatted in row/column labels so headers do
  // not show raw timestamps / YYYYMMDD integers / ISO strings.
  const formatDimLabel = (key: string, value: unknown): string => {
    if (value === null || value === undefined) return "";
    if (dateColumns && dateColumns.includes(key)) {
      return formatDateValue(value) ?? String(value);
    }
    return String(value);
  };

  const {
    colHeaders,
    rowHeaders,
    values,
    rowLabels,
    colLabels,
    rowDimLabels,
    colDimNames,
    colCombos,
    colGroupStarts,
    truncated,
    totalRows: gridTotalRows,
    subtotalRows: gridSubtotalRows,
  } = useMemo(() => buildPivotGrid(props), [props]);

  const totalsLookup = useMemo(() => {
    const source = gridTotalRows ?? props.totalRows;
    if (!source) return null;
    const map = new Map<string, Record<string, unknown>>();
    for (const r of source) {
      map.set(colDimNames.map((d) => String(r[d] ?? "")).join("\u0000"), r);
    }
    return map;
  }, [gridTotalRows, props.totalRows, colDimNames]);

  const backendTotal = (cIdx: number): number | null => {
    if (!totalsLookup) return null;
    const combo = colCombos[cIdx] ?? [];
    const metric = colLabels[cIdx];
    if (!metric) return null;
    const row = totalsLookup.get(
      combo.map((v) => String(v ?? "")).join("\u0000"),
    );
    const v = row?.[metric];
    return typeof v === "number" ? v : null;
  };

  const showRowTotals = props.rowTotals;
  const showColTotals = props.colTotals;

  const hasNestedRows = rowHeaders.length >= 2;
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );

  const findGroup = (
    list: PivotGroup[],
    collapseKey: string,
  ): PivotGroup | null => {
    for (const g of list) {
      if (g.collapseKey === collapseKey) return g;
      const found = findGroup(g.children, collapseKey);
      if (found) return found;
    }
    return null;
  };

  // Collapsing a group also collapses every descendant group (all lower
  // row dimensions), Excel-style; expanding only affects the group itself,
  // so children stay collapsed until explicitly expanded. Leaf groups (the
  // deepest dimension) follow the same keys, so their rows are only shown
  // while the leaf group itself is expanded.
  const toggleGroup = (collapseKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(collapseKey)) {
        next.delete(collapseKey);
        const target = findGroup(groups, collapseKey);
        if (target) {
          const stack = [...target.children];
          while (stack.length > 0) {
            const g = stack.pop() as PivotGroup;
            if (g.children.length === 0) {
              next.delete(g.collapseKey);
            } else {
              stack.push(...g.children);
            }
          }
        }
      } else {
        next.add(collapseKey);
        const target = findGroup(groups, collapseKey);
        if (target) {
          const stack = [...target.children];
          while (stack.length > 0) {
            const g = stack.pop() as PivotGroup;
            if (g.children.length > 0) {
              next.add(g.collapseKey);
              stack.push(...g.children);
            }
          }
        }
      }
      return next;
    });
  };

  const groups = useMemo(() => {
    const indices = rowLabels.map((_, i) => i);
    if (!hasNestedRows) {
      return [
        {
          level: 0,
          keyTuple: [""],
          collapseKey: "",
          rows: indices,
          children: [] as PivotGroup[],
        },
      ];
    }
    return buildTree(0, indices, [], rowHeaders);
  }, [rowLabels, rowHeaders, hasNestedRows]);

  // The signature covers the full dimension-value tree of the raw data, not
  // the pct95-filtered grid: switching the 95% split metric re-filters rows
  // client-side, which must not reset the collapse state. The reset only
  // fires when the underlying rows actually change (data refresh/filters).
  const groupSignature = useMemo(() => {
    const rows = Array.isArray(data) ? data : [];
    const tuples: string[] = [];
    for (const r of rows) {
      let acc = "";
      for (const dim of rowDimLabels) {
        acc = acc
          ? `${acc}\u0000${String(r[dim] ?? "")}`
          : String(r[dim] ?? "");
        tuples.push(acc);
      }
    }
    return JSON.stringify([...new Set(tuples)].sort());
  }, [data, rowDimLabels]);
  const [groupSignatureState, setGroupSignatureState] = useState("");
  if (hasNestedRows && groupSignatureState !== groupSignature) {
    setGroupSignatureState(groupSignature);
    const keys = new Set<string>();
    const collect = (list: PivotGroup[]): void => {
      for (const g of list) {
        keys.add(g.collapseKey);
        collect(g.children);
      }
    };
    collect(groups);
    setCollapsedGroups(keys);
  }

  // All groups (leaf groups included) indexed by their dimension level, so
  // each dimension label can quickly collapse/expand every group below it.
  const groupsByLevel = useMemo(() => {
    const byLevel: PivotGroup[][] = [];
    const collect = (list: PivotGroup[]): void => {
      for (const g of list) {
        (byLevel[g.level] ??= []).push(g);
        collect(g.children);
      }
    };
    collect(groups);
    return byLevel;
  }, [groups]);

  // Keys of every group at `level` and deeper: the quick toggle on a
  // dimension label operates on that dimension plus all lower ones, so
  // expanding at a collapsed level also reveals its own groups.
  const belowKeysByLevel = useMemo(() => {
    const result: string[][] = [];
    for (let level = 0; level < groupsByLevel.length; level += 1) {
      const keys: string[] = [];
      for (let l = level; l < groupsByLevel.length; l += 1) {
        for (const g of groupsByLevel[l]) keys.push(g.collapseKey);
      }
      result.push(keys);
    }
    return result;
  }, [groupsByLevel]);

  // Keys of the groups a dimension-label quick toggle operates on: the
  // dimension itself and everything below it, so collapsing the "渠道商"
  // label hides the channel groups, not just the games under them.
  const toggleKeysForLevel = (level: number): string[] =>
    belowKeysByLevel[level] ?? [];

  const belowCollapsed = (level: number): boolean => {
    const keys = toggleKeysForLevel(level);
    return keys.length > 0 && keys.every((k) => collapsedGroups.has(k));
  };

  const toggleBelow = (level: number) => {
    const keys = toggleKeysForLevel(level);
    if (keys.length === 0) return;
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      const expand = keys.every((k) => next.has(k));
      for (const k of keys) {
        if (expand) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  const levelQuickToggle = (level: number): ReactNode => {
    if (level >= groupsByLevel.length - 1) return null;
    if (toggleKeysForLevel(level).length === 0) return null;
    const expand = belowCollapsed(level);
    const label = expand ? "展开全部下级维度" : "折叠全部下级维度";
    return (
      <Tooltip title={label} placement="bottom">
        <IconButton
          size="small"
          aria-label={label}
          onClick={() => toggleBelow(level)}
          sx={{ p: 0, minWidth: 20, minHeight: 20, color: "inherit" }}
        >
          {expand ? (
            <UnfoldMoreIcon sx={{ fontSize: 16 }} />
          ) : (
            <UnfoldLessIcon sx={{ fontSize: 16 }} />
          )}
        </IconButton>
      </Tooltip>
    );
  };

  // A row-dimension level's column exists only while some group at that
  // level actually renders: intermediate groups always render their header
  // row when their ancestors are expanded, while leaf groups (the deepest
  // dimension) only render their data rows when expanded themselves, so
  // collapsing a lower level removes its column (and all deeper ones).
  const showLevelLabels = useMemo(() => {
    const renderedByLevel: boolean[] = [];
    const expandedLeavesByLevel: boolean[] = [];
    const walk = (list: PivotGroup[], ancestorsExpanded: boolean): void => {
      for (const g of list) {
        const groupExpanded = !collapsedGroups.has(g.collapseKey);
        if (ancestorsExpanded) renderedByLevel[g.level] = true;
        if (ancestorsExpanded && groupExpanded && g.children.length === 0) {
          expandedLeavesByLevel[g.level] = true;
        }
        walk(g.children, ancestorsExpanded && groupExpanded);
      }
    };
    walk(groups, true);
    const leafLevel = rowDimLabels.length - 1;
    const visible: boolean[] = [true];
    for (let level = 1; level < rowDimLabels.length; level += 1) {
      visible[level] =
        level === leafLevel
          ? expandedLeavesByLevel[level] === true
          : renderedByLevel[level] === true;
    }
    return visible;
  }, [groups, rowDimLabels.length, collapsedGroups]);

  const visibleRowDimCount = showLevelLabels.filter(Boolean).length;

  const subtotalLookupByLevel = useMemo(() => {
    const source = gridSubtotalRows ?? props.subtotalRows;
    if (!source) return null;
    return source.map((rows, level) => {
      if (!rows) return null;
      const dims = rowDimLabels.slice(0, level + 1);
      const map = new Map<string, Record<string, unknown>>();
      for (const r of rows) {
        map.set(
          [
            ...dims.map((d) => String(r[d] ?? "")),
            ...colDimNames.map((d) => String(r[d] ?? "")),
          ].join("\u0000"),
          r,
        );
      }
      return map;
    });
  }, [gridSubtotalRows, props.subtotalRows, rowDimLabels, colDimNames]);

  const subtotalValue = (group: PivotGroup, cIdx: number): number | null => {
    const lookup = subtotalLookupByLevel?.[group.level];
    if (!lookup) return null;
    const combo = colCombos[cIdx] ?? [];
    const metric = colLabels[cIdx];
    if (!metric) return null;
    const row = lookup.get(
      [...group.keyTuple, ...combo.map((v) => String(v ?? ""))].join("\u0000"),
    );
    const v = row?.[metric];
    return typeof v === "number" ? v : null;
  };

  const groupClientSum = (rows: number[], cIdx: number): number | null => {
    let sum = 0;
    let any = false;
    for (const rIdx of rows) {
      const v = values[rIdx]?.[cIdx];
      if (v !== null && v !== undefined) {
        sum += v;
        any = true;
      }
    }
    return any ? sum : null;
  };

  // In 95% mode the split metric is also the display sort: groups at every
  // level are ordered by their aggregated value descending, so collapsed
  // subtotal rows and expanded children both read largest-to-smallest.
  const sortedGroups = useMemo(() => {
    if (!pct95?.enabled) return groups;
    const metricIdx = colLabels.indexOf(pct95.metric);
    if (metricIdx < 0) return groups;
    const groupValue = (g: PivotGroup): number => {
      const lookup = subtotalLookupByLevel?.[g.level];
      const combo = colCombos[metricIdx] ?? [];
      const metric = colLabels[metricIdx];
      const backend =
        lookup && metric
          ? lookup.get(
              [...g.keyTuple, ...combo.map((v) => String(v ?? ""))].join(
                "\u0000",
              ),
            )?.[metric]
          : undefined;
      if (typeof backend === "number") return backend;
      let sum = 0;
      let any = false;
      for (const rIdx of g.rows) {
        const v = values[rIdx]?.[metricIdx];
        if (v !== null && v !== undefined) {
          sum += v;
          any = true;
        }
      }
      return any ? sum : -Infinity;
    };
    const clone = (g: PivotGroup): PivotGroup => ({
      ...g,
      children: g.children.map(clone),
    });
    const sortRec = (list: PivotGroup[]): void => {
      list.sort((a, b) => groupValue(b) - groupValue(a));
      for (const g of list) sortRec(g.children);
    };
    const copy = groups.map(clone);
    sortRec(copy);
    return copy;
  }, [groups, pct95, colLabels, colCombos, values, subtotalLookupByLevel]);

  if (values.length === 0 || colLabels.length === 0) {
    return (
      <Box
        sx={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Typography variant="body2" color="text.disabled">
          暂无数据
        </Typography>
      </Box>
    );
  }

  const groupStarts = new Set(colGroupStarts.filter((i) => i > 0));

  const rowTotal = values.map((row) =>
    row.reduce<number>((acc, v) => acc + (v ?? 0), 0),
  );
  const colTotal = colLabels.map((_, cIdx) =>
    values.reduce<number>((acc, row) => acc + (row[cIdx] ?? 0), 0),
  );
  const grandTotal = rowTotal.reduce<number>((acc, v) => acc + v, 0);

  const renderCell = (key: string, v: number | null | undefined) => {
    if (v === null || v === undefined) return "";
    return formatCell ? formatCell(key, v) : String(v);
  };

  const cellStyle = {
    minWidth: 90,
    fontSize: "0.7rem",
    textAlign: "right" as const,
    fontVariantNumeric: "tabular-nums" as const,
    p: 0.5,
  };
  const rowHeaderStyle = {
    position: "sticky" as const,
    zIndex: 2,
    minWidth: 120,
    fontSize: "0.7rem",
    whiteSpace: "nowrap" as const,
    p: 0.5,
    borderRight: "1px solid",
    borderRightColor: "divider",
  };
  const cornerStyle = {
    position: "sticky" as const,
    left: 0,
    zIndex: 3,
    minWidth: 120,
    fontSize: "0.7rem",
    whiteSpace: "nowrap" as const,
    p: 0.5,
    borderRight: "2px solid",
    borderRightColor: boundaryColor,
  };
  // Column area (column labels + values): green
  const colAreaStyle = {
    "&.MuiTableCell-head": { bgcolor: "success.container" },
    bgcolor: "success.container",
    color: "success.onContainer",
    fontWeight: 600,
  };
  // Row area (row labels + values): blue
  const rowAreaStyle = {
    "&.MuiTableCell-head": { bgcolor: "#e7eef1" },
    bgcolor: "#e7eef1",
    color: "text.primary",
    fontWeight: 600,
  };
  // Value area (metric headers, data cells, totals): yellow
  const valueAreaStyle = {
    "&.MuiTableCell-head": { bgcolor: "#f6f0e2" },
    bgcolor: "#f6f0e2",
    color: "text.primary",
    fontWeight: 400,
  };

  const colCornerLabel =
    colDimNames.length > 0 ? colDimNames.join(" · ") : "列标签";

  const renderGroup = (group: PivotGroup): ReactNode[] => {
    const nodes: ReactNode[] = [];
    const isCollapsed = collapsedGroups.has(group.collapseKey);
    if (group.children.length > 0) {
      nodes.push(
        <TableRow
          key={`cg-${group.collapseKey}`}
          sx={{
            "&:last-child td": { borderBottom: 0 },
          }}
        >
          {rowHeaders.map((levelHeaders, level) => {
            if (!showLevelLabels[level]) return null;
            if (level === group.level) {
              // Subtotal row: merge the group label across every remaining
              // level column, e.g. "oversea | 枫之谷-印尼汇总" for a group at
              // level 1 (the deeper empty cells are absorbed by the span).
              let span = 0;
              for (let l = level; l < showLevelLabels.length; l += 1) {
                if (showLevelLabels[l]) span += 1;
              }
              return (
                <TableCell
                  key={`cgv-${level}`}
                  colSpan={span}
                  sx={{
                    left: level * 120,
                    ...rowHeaderStyle,
                    ...rowAreaStyle,
                    fontWeight: 700,
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.25,
                      cursor: "pointer",
                    }}
                    onClick={() => toggleGroup(group.collapseKey)}
                  >
                    <Box
                      component="span"
                      sx={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatDimLabel(
                        rowDimLabels[level],
                        group.keyTuple[level],
                      )}
                      {!isCollapsed ? " 汇总" : ""}
                    </Box>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGroup(group.collapseKey);
                      }}
                      sx={{ p: 0, minWidth: 18, minHeight: 18 }}
                    >
                      {isCollapsed ? (
                        <ChevronRightIcon sx={{ fontSize: 16 }} />
                      ) : (
                        <ExpandMoreIcon sx={{ fontSize: 16 }} />
                      )}
                    </IconButton>
                  </Box>
                </TableCell>
              );
            }
            if (level < group.level) {
              return (
                <TableCell
                  key={`cgv-${level}`}
                  sx={{
                    left: level * 120,
                    ...rowHeaderStyle,
                    ...rowAreaStyle,
                    fontWeight: 700,
                  }}
                >
                  {formatDimLabel(rowDimLabels[level], group.keyTuple[level])}
                </TableCell>
              );
            }
            return null;
          })}
          {colLabels.map((colLabel, cIdx) => {
            const backend = subtotalValue(group, cIdx);
            const fallback = groupClientSum(group.rows, cIdx);
            const value = backend !== null ? backend : fallback;
            return (
              <TableCell
                key={`cgc-${cIdx}`}
                sx={{
                  ...cellStyle,
                  ...valueAreaStyle,
                  fontWeight: 600,
                  ...(groupStarts.has(cIdx) ? boundaryStyle : {}),
                }}
              >
                {renderCell(colLabel, value)}
              </TableCell>
            );
          })}
          {showRowTotals && (
            <TableCell
              sx={{
                ...cellStyle,
                ...valueAreaStyle,
                fontWeight: 700,
              }}
            >
              {renderCell(
                "__total__",
                rowTotal[group.rows[group.rows.length - 1]],
              )}
            </TableCell>
          )}
        </TableRow>,
      );
      if (!isCollapsed) {
        for (const child of group.children) {
          nodes.push(...renderGroup(child));
        }
      }
    } else if (!collapsedGroups.has(group.collapseKey)) {
      for (const rIdx of group.rows) {
        nodes.push(
          <TableRow
            key={rIdx}
            sx={{
              "&:last-child td": { borderBottom: 0 },
            }}
          >
            {rowHeaders.map((levelHeaders, level) =>
              showLevelLabels[level] ? (
                <TableCell
                  key={`rv-${level}`}
                  sx={{
                    left: level * 120,
                    ...rowHeaderStyle,
                    ...rowAreaStyle,
                    ...(level > 0 ? { fontWeight: 400 } : {}),
                  }}
                >
                  {formatDimLabel(rowDimLabels[level], levelHeaders[rIdx])}
                </TableCell>
              ) : null,
            )}
            {colLabels.map((colLabel, cIdx) => (
              <TableCell
                key={`cv-${cIdx}`}
                sx={{
                  ...cellStyle,
                  ...valueAreaStyle,
                  ...(groupStarts.has(cIdx) ? boundaryStyle : {}),
                }}
              >
                {renderCell(colLabel, values[rIdx]?.[cIdx])}
              </TableCell>
            ))}
            {showRowTotals && (
              <TableCell
                sx={{
                  ...cellStyle,
                  ...valueAreaStyle,
                  fontWeight: 700,
                }}
              >
                {renderCell("__total__", rowTotal[rIdx])}
              </TableCell>
            )}
          </TableRow>,
        );
      }
    }
    return nodes;
  };

  return (
    <TableContainer sx={{ width: "100%", maxHeight: "100%", overflow: "auto" }}>
      <Table size="small" stickyHeader>
        <TableHead>
          {colHeaders.map((levelHeaders, level) => {
            const isLastLevel = level === colHeaders.length - 1;
            const groups = isLastLevel
              ? levelHeaders.map((label, idx) => ({
                  label,
                  span: 1,
                  groupStart: groupStarts.has(idx),
                }))
              : mergeConsecutive(levelHeaders).map((g) => ({
                  ...g,
                  groupStart: false,
                }));
            return (
              <TableRow key={`hl-${level}`}>
                {rowDimLabels.length > 0 &&
                  (colHeaders.length >= 2 && level === 0 ? (
                    <TableCell
                      colSpan={visibleRowDimCount}
                      sx={{
                        ...cornerStyle,
                        ...colAreaStyle,
                        minWidth: 120 * visibleRowDimCount,
                      }}
                    >
                      {colCornerLabel}
                    </TableCell>
                  ) : (colHeaders.length >= 2 ? level === 1 : level === 0) ? (
                    rowDimLabels.map((label, rl) =>
                      showLevelLabels[rl] ? (
                        <TableCell
                          key={`rl-${rl}`}
                          sx={{
                            ...cornerStyle,
                            ...rowAreaStyle,
                            left: rl * 120,
                            minWidth: 120,
                          }}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.5,
                            }}
                          >
                            {levelQuickToggle(rl)}
                            <Box
                              component="span"
                              sx={{
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {label}
                            </Box>
                          </Box>
                        </TableCell>
                      ) : null,
                    )
                  ) : null)}
                {groups.map((group, gi) => (
                  <TableCell
                    key={`hc-${level}-${gi}`}
                    colSpan={group.span}
                    sx={{
                      ...cellStyle,
                      ...(!isLastLevel ? colAreaStyle : valueAreaStyle),
                      ...(!isLastLevel
                        ? { fontWeight: 600 }
                        : { fontWeight: 500 }),
                      textAlign: group.span > 1 ? "center" : "right",
                      ...(!isLastLevel
                        ? {
                            borderRight: "2px solid",
                            borderRightColor: boundaryColor,
                          }
                        : group.groupStart
                          ? boundaryStyle
                          : {}),
                    }}
                  >
                    {level < colDimNames.length
                      ? formatDimLabel(colDimNames[level], group.label)
                      : group.label}
                  </TableCell>
                ))}
                {level === 0 && showRowTotals && (
                  <TableCell
                    rowSpan={colHeaders.length}
                    sx={{
                      ...cellStyle,
                      ...valueAreaStyle,
                      fontWeight: 700,
                    }}
                  >
                    合计
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableHead>
        <TableBody>
          {sortedGroups.flatMap((group) => renderGroup(group))}
          {showColTotals && (
            <TableRow
              sx={{
                "& td": {
                  borderTop: "2px solid",
                  borderTopColor: boundaryColor,
                },
              }}
            >
              {rowDimLabels.map((_, level) =>
                showLevelLabels[level] ? (
                  <TableCell
                    key={`ct-${level}`}
                    sx={{
                      left: level * 120,
                      bottom: 0,
                      ...rowHeaderStyle,
                      ...rowAreaStyle,
                      zIndex: 3,
                      fontWeight: 700,
                    }}
                  >
                    {level === 0 ? "合计" : ""}
                  </TableCell>
                ) : null,
              )}
              {colLabels.map((colLabel, cIdx) => {
                const backend = backendTotal(cIdx);
                const value = backend !== null ? backend : colTotal[cIdx];
                return (
                  <TableCell
                    key={`ctv-${cIdx}`}
                    sx={{
                      ...cellStyle,
                      ...valueAreaStyle,
                      position: "sticky",
                      bottom: 0,
                      zIndex: 2,
                      fontWeight: 700,
                      ...(groupStarts.has(cIdx) ? boundaryStyle : {}),
                    }}
                  >
                    {renderCell(colLabel, value)}
                  </TableCell>
                );
              })}
              {showRowTotals && (
                <TableCell
                  sx={{
                    ...cellStyle,
                    ...valueAreaStyle,
                    position: "sticky",
                    bottom: 0,
                    zIndex: 2,
                    fontWeight: 700,
                  }}
                >
                  {renderCell("__total__", grandTotal)}
                </TableCell>
              )}
            </TableRow>
          )}
        </TableBody>
      </Table>
      {truncated && (
        <Typography
          variant="caption"
          sx={{
            display: "block",
            px: 1,
            py: 0.5,
            color: "text.secondary",
            bgcolor: "background.paper",
          }}
        >
          数据量较大，已截断显示（最多 {MAX_PIVOT_ROWS} 行 / {MAX_PIVOT_COLS}{" "}
          列）
        </Typography>
      )}
    </TableContainer>
  );
}

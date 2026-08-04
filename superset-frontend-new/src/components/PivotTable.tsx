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
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { buildPivotGrid, type PivotTableProps } from "@/utils/pivot";

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
  const result: PivotGroup[] = [];
  let current: PivotGroup | null = null;
  for (const i of indices) {
    const key = rowHeaders[level]?.[i] ?? "";
    if (!current || current.keyTuple[level] !== key) {
      current = {
        level,
        keyTuple: [...ancestors, key],
        collapseKey: `${level}:${[...ancestors, key].join("\u0000")}`,
        rows: [],
        children: [],
      };
      result.push(current);
    }
    current.rows.push(i);
  }
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
  const { formatCell } = props;
  const theme = useTheme();
  const boundaryColor = theme.palette.divider;
  const boundaryStyle = {
    borderLeft: "2px solid",
    borderLeftColor: boundaryColor,
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
  } = useMemo(() => buildPivotGrid(props), [props]);

  const totalsLookup = useMemo(() => {
    if (!props.totalRows) return null;
    const map = new Map<string, Record<string, unknown>>();
    for (const r of props.totalRows) {
      map.set(colDimNames.map((d) => String(r[d] ?? "")).join("\u0000"), r);
    }
    return map;
  }, [props.totalRows, colDimNames]);

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

  const toggleGroup = (collapseKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(collapseKey)) next.delete(collapseKey);
      else next.add(collapseKey);
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

  const groupSignature = useMemo(
    () => JSON.stringify(groups.map((g) => g.keyTuple)),
    [groups],
  );
  const [groupSignatureState, setGroupSignatureState] = useState("");
  if (hasNestedRows && groupSignatureState !== groupSignature) {
    setGroupSignatureState(groupSignature);
    const keys = new Set<string>();
    const collect = (list: PivotGroup[]): void => {
      for (const g of list) {
        if (g.children.length > 0) keys.add(g.collapseKey);
        collect(g.children);
      }
    };
    collect(groups);
    setCollapsedGroups(keys);
  }

  // A row-dimension level's column is only visible when some group at the
  // previous level is expanded (i.e. rows at this level are shown somewhere).
  const showLevelLabels = useMemo(() => {
    const findExpandedAtLevel = (level: number): boolean => {
      const stack: PivotGroup[] = [...groups];
      while (stack.length > 0) {
        const node = stack.pop() as PivotGroup;
        if (node.level === level && !collapsedGroups.has(node.collapseKey)) {
          return true;
        }
        stack.push(...node.children);
      }
      return false;
    };
    const visible: boolean[] = [true];
    for (let level = 1; level < rowDimLabels.length; level += 1) {
      visible[level] = findExpandedAtLevel(level - 1);
    }
    return visible;
  }, [groups, rowDimLabels.length, collapsedGroups]);

  const visibleRowDimCount = showLevelLabels.filter(Boolean).length;

  const subtotalLookupByLevel = useMemo(() => {
    if (!props.subtotalRows) return null;
    return props.subtotalRows.map((rows, level) => {
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
  }, [props.subtotalRows, rowDimLabels, colDimNames]);

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
          {rowHeaders.map((levelHeaders, level) =>
            showLevelLabels[level] ? (
              <TableCell
                key={`cgv-${level}`}
                sx={{
                  left: level * 120,
                  ...rowHeaderStyle,
                  ...rowAreaStyle,
                  fontWeight: 700,
                }}
              >
                {level === group.level ? (
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 0.25,
                      cursor: "pointer",
                    }}
                    onClick={() => toggleGroup(group.collapseKey)}
                  >
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
                    <Box
                      component="span"
                      sx={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {group.keyTuple[level]}
                    </Box>
                  </Box>
                ) : level < group.level ? (
                  (group.keyTuple[level] ?? "")
                ) : (
                  ""
                )}
              </TableCell>
            ) : null,
          )}
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
    } else {
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
                  {level === 0 && hasNestedRows ? (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.25,
                      }}
                    >
                      <Box sx={{ width: 18, flexShrink: 0 }} />
                      <Box
                        component="span"
                        sx={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {levelHeaders[rIdx] ?? ""}
                      </Box>
                    </Box>
                  ) : (
                    (levelHeaders[rIdx] ?? "")
                  )}
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
                          {label}
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
                    {group.label}
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
          {groups.flatMap((group) => renderGroup(group))}
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
          数据量较大，已截断显示（最多 1000 行 / 80 列）
        </Typography>
      )}
    </TableContainer>
  );
}

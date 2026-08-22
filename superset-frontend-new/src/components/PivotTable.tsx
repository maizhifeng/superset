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
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
  fractionMode,
  MAX_PIVOT_COLS,
  MAX_PIVOT_ROWS,
  type PivotTableProps,
} from "@/utils/pivot";
import {
  mergeConsecutive,
  buildTree,
  type PivotGroup,
} from "@/utils/pivot/tree";
import { buildPivotTextExport } from "@/utils/pivot/textExport";
import { formatDateValue } from "@/utils/dateHeuristics";

export { type PivotTableProps } from "@/utils/pivot";

/** Default width of a row-dimension level column. */
export const ROW_HEADER_WIDTH = 120;
/** Default minimum width of a value column. */
export const CELL_MIN_WIDTH = 90;
/** Estimated row height for the windowed body rendering (browser only). */
const ESTIMATED_ROW_HEIGHT = 32;
/** Rows rendered above/below the visible window while virtualized. */
const VIRTUAL_BUFFER_ROWS = 20;
/** Virtualize the body once more rows than this are visible. */
const VIRTUALIZE_THRESHOLD = 80;
/** Hit area of the column-resize handle. */
const RESIZE_HANDLE_WIDTH = 8;
/** Row-header columns stop resizing below this width. */
const MIN_RESIZED_WIDTH = 48;
/** Font size of headers, subtotal rows and totals. */
const HEADER_FONT_SIZE = "0.7rem";
/** Font size of leaf detail rows: slightly smaller than headers/totals. */
const DETAIL_FONT_SIZE = "0.65rem";

// Pivot area colors (row/column/value), kept as constants so light and dark
// themes could swap them without touching cell styles.
const ROW_AREA_BG = "#e7eef1";
const VALUE_AREA_BG = "#f6f0e2";

export interface PivotTableHandle {
  /**
   * TSV text of the current visible layout: headers, the visible rows
   * (collapsed groups excluded) and the totals row — matching what the
   * table shows, not the full detail dataset.
   */
  getLayoutText: () => string | null;
}

const PivotTable = forwardRef<PivotTableHandle, PivotTableProps>(
  function PivotTable(props, ref) {
    const {
      formatCell,
      dateColumns,
      pct95,
      data,
      wideData,
      groupbyRows,
      groupbyColumns,
      metrics,
      aggregateFunction,
      transposePivot,
      metricsLayout,
    } = props;
    const theme = useTheme();
    const boundaryColor = theme.palette.divider;
    // Slightly darker than the theme divider so the grid reads clearly.
    const gridBorderColor =
      theme.palette.mode === "dark"
        ? "rgba(255, 255, 255, 0.22)"
        : "rgba(0, 0, 0, 0.22)";
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
      rawRowTotals,
      rawColTotals,
      rawGrandTotal,
      totalRows: gridTotalRows,
      subtotalRows: gridSubtotalRows,
    } = useMemo(
      () =>
        buildPivotGrid({
          data,
          wideData,
          groupbyRows,
          groupbyColumns,
          metrics,
          aggregateFunction,
          transposePivot,
          metricsLayout,
          pct95,
          dateColumns,
        }),
      // Only the aggregation inputs: display-only fields (formatCell) and the
      // backend totals/subtotals arriving after the grid must not re-run the
      // client-side aggregation.
      [
        data,
        wideData,
        groupbyRows,
        groupbyColumns,
        metrics,
        aggregateFunction,
        transposePivot,
        metricsLayout,
        pct95,
        dateColumns,
      ],
    );

    const totalsLookup = useMemo(() => {
      const source = gridTotalRows ?? props.totalRows;
      if (!source) return null;
      const map = new Map<string, Record<string, unknown>>();
      for (const r of source) {
        map.set(colDimNames.map((d) => String(r[d] ?? "")).join("\u0000"), r);
      }
      return map;
    }, [gridTotalRows, props.totalRows, colDimNames]);

    // "Fraction of Total/Rows/Columns": the backend/aggregated totals are raw
    // sums, so re-derive their denominators from the pre-fraction grid to keep
    // totals/subtotals consistent with the fractioned cells.
    const fractionOf = fractionMode(props.aggregateFunction ?? "Sum");
    const fractionFactor = (
      cIdx: number,
      groupRawTotal: number | null,
      isGrandRow: boolean,
    ): number => {
      if (!fractionOf) return 1;
      const denominator =
        fractionOf === "Total"
          ? rawGrandTotal
          : fractionOf === "Columns"
            ? rawColTotals[cIdx]
            : isGrandRow
              ? rawGrandTotal
              : groupRawTotal;
      return denominator ? 1 / denominator : 0;
    };

    const backendTotal = (cIdx: number): number | null => {
      if (!totalsLookup) return null;
      const combo = colCombos[cIdx] ?? [];
      const metric = colLabels[cIdx];
      if (!metric) return null;
      const row = totalsLookup.get(
        combo.map((v) => String(v ?? "")).join("\u0000"),
      );
      const v = row?.[metric];
      if (typeof v !== "number") return null;
      return v * fractionFactor(cIdx, null, true);
    };

    const showRowTotals = props.rowTotals;
    const showColTotals = props.colTotals;

    const hasNestedRows = rowHeaders.length >= 2;
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
      () => new Set(),
    );

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

    // collapseKey → group lookup, so collapse/expand toggles and the cascade
    // don't re-traverse the whole tree on every interaction.
    const groupIndex = useMemo(() => {
      const index = new Map<string, PivotGroup>();
      const collect = (list: PivotGroup[]): void => {
        for (const g of list) {
          index.set(g.collapseKey, g);
          collect(g.children);
        }
      };
      collect(groups);
      return index;
    }, [groups]);

    // Collapsing a group also collapses every descendant group (all lower
    // row dimensions), Excel-style; expanding only affects the group itself,
    // so children stay collapsed until explicitly expanded. Leaf groups (the
    // deepest dimension) follow the same keys, so their rows are only shown
    // while the leaf group itself is expanded.
    const toggleGroup = (collapseKey: string) => {
      setCollapsedGroups((prev) => {
        const next = new Set(prev);
        const target = groupIndex.get(collapseKey);
        if (next.has(collapseKey)) {
          next.delete(collapseKey);
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
        [...group.keyTuple, ...combo.map((v) => String(v ?? ""))].join(
          "\u0000",
        ),
      );
      const v = row?.[metric];
      if (typeof v !== "number") return null;
      let groupRawTotal: number | null = null;
      if (fractionOf === "Rows") {
        groupRawTotal = group.rows.reduce(
          (acc, rIdx) => acc + rawRowTotals[rIdx],
          0,
        );
      }
      return v * fractionFactor(cIdx, groupRawTotal, false);
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
    // Date dimensions soften this per collapse state: collapsed date groups
    // keep the metric ordering (top rows first), while expanded date groups
    // keep the chronological grid order from `buildPivotGrid`, so their
    // detail rows read oldest-to-newest.
    const dateLevels = rowDimLabels.map(
      (d) => dateColumns?.includes(d) ?? false,
    );
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
      const sortRec = (list: PivotGroup[], level: number): void => {
        if (dateLevels[level]) {
          // Date level: collapsed groups rank by the split metric descending
          // (top contributions first); expanded groups keep their chronological
          // order from the grid, grouped after the collapsed ones.
          const originalIdx = new Map(list.map((g, i) => [g, i]));
          list.sort((a, b) => {
            const aCollapsed = collapsedGroups.has(a.collapseKey);
            const bCollapsed = collapsedGroups.has(b.collapseKey);
            const aIdx = originalIdx.get(a) ?? 0;
            const bIdx = originalIdx.get(b) ?? 0;
            if (aCollapsed && bCollapsed)
              return groupValue(b) - groupValue(a) || aIdx - bIdx;
            if (aCollapsed) return -1;
            if (bCollapsed) return 1;
            return aIdx - bIdx;
          });
        } else {
          list.sort((a, b) => groupValue(b) - groupValue(a));
        }
        for (const g of list) {
          if (!collapsedGroups.has(g.collapseKey))
            sortRec(g.children, level + 1);
        }
      };
      const copy = groups.map(clone);
      sortRec(copy, 0);
      return copy;
    }, [
      groups,
      pct95,
      dateLevels,
      collapsedGroups,
      colLabels,
      colCombos,
      values,
      subtotalLookupByLevel,
    ]);

    const groupStarts = useMemo(
      () => new Set(colGroupStarts.filter((i) => i > 0)),
      [colGroupStarts],
    );

    const rowTotal = useMemo(
      () =>
        values.map((row) => row.reduce<number>((acc, v) => acc + (v ?? 0), 0)),
      [values],
    );
    const colTotal = useMemo(
      () =>
        colLabels.map((_, cIdx) =>
          values.reduce<number>((acc, row) => acc + (row[cIdx] ?? 0), 0),
        ),
      [values, colLabels],
    );
    const grandTotal = useMemo(
      () => rowTotal.reduce<number>((acc, v) => acc + v, 0),
      [rowTotal],
    );

    // --- Column widths (drag to resize from the header cells) ---
    const [colWidths, setColWidths] = useState<Record<string, number>>({});
    const getColWidth = useCallback(
      (key: string, fallback: number): number => colWidths[key] ?? fallback,
      [colWidths],
    );

    // Sticky vertical offsets per header row: MUI's stickyHeader pins every
    // thead row at top:0, which would stack multi-row headers on top of each
    // other. `headTops[level]` is the summed height of the rows above, so each
    // header row sticks right below the previous one.
    const theadRef = useRef<HTMLTableSectionElement>(null);
    const [headTops, setHeadTops] = useState<number[]>([]);
    useLayoutEffect(() => {
      const thead = theadRef.current;
      if (!thead) return;
      const update = () => {
        const tops: number[] = [];
        let acc = 0;
        for (const row of Array.from(thead.rows)) {
          tops.push(acc);
          acc += row.offsetHeight;
        }
        setHeadTops(tops);
      };
      update();
      let observer: ResizeObserver | null = null;
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(update);
        observer.observe(thead);
      }
      return () => observer?.disconnect();
    }, [colHeaders.length, visibleRowDimCount, colLabels.length]);
    const dragRef = useRef<{
      key: string;
      startX: number;
      startWidth: number;
    } | null>(null);
    /** Screen X of the drag boundary line while resizing a column (null = idle). */
    const [resizeIndicatorX, setResizeIndicatorX] = useState<number | null>(
      null,
    );
    useEffect(() => {
      const onMove = (e: MouseEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const next = Math.max(
          MIN_RESIZED_WIDTH,
          drag.startWidth + e.clientX - drag.startX,
        );
        setColWidths((prev) => ({ ...prev, [drag.key]: next }));
        setResizeIndicatorX(e.clientX);
      };
      const onUp = () => {
        dragRef.current = null;
        setResizeIndicatorX(null);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      return () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
    }, []);
    const startResize =
      (key: string, startWidth: number) => (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragRef.current = { key, startX: e.clientX, startWidth };
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      };

    // Sticky-left offsets per row-header level, derived from the resized widths.
    const rowHeaderOffsets = useMemo(() => {
      const offsets: number[] = [];
      let acc = 0;
      for (let l = 0; l < rowDimLabels.length; l += 1) {
        offsets.push(acc);
        acc += getColWidth(`rh-${l}`, ROW_HEADER_WIDTH);
      }
      return offsets;
    }, [rowDimLabels, getColWidth]);
    const cornerWidth = useMemo(() => {
      let acc = 0;
      for (let l = 0; l < rowDimLabels.length; l += 1) {
        if (showLevelLabels[l]) acc += getColWidth(`rh-${l}`, ROW_HEADER_WIDTH);
      }
      return acc;
    }, [rowDimLabels, showLevelLabels, getColWidth]);

    // --- Flattened visible rows + windowed body rendering ---
    // Row order comes from `buildPivotGrid` (smart ordering: 95% mode metric
    // ranking, chronological date dimensions), so no manual column sort.
    // Each row carries its full dimension tuple (`dims`) so consecutive rows
    // with identical ancestor values can merge their header cells (rowSpan).
    const visibleRows = useMemo(() => {
      const out: {
        key: string;
        group?: PivotGroup;
        rIdx?: number;
        dims: string[];
      }[] = [];
      const walk = (list: PivotGroup[]): void => {
        for (const g of list) {
          if (g.children.length > 0) {
            out.push({
              key: `cg-${g.collapseKey}`,
              group: g,
              dims: g.keyTuple,
            });
            if (!collapsedGroups.has(g.collapseKey)) walk(g.children);
          } else if (!collapsedGroups.has(g.collapseKey)) {
            for (const rIdx of g.rows) {
              out.push({
                key: `r-${rIdx}`,
                rIdx,
                dims: rowHeaders.map(
                  (levelHeaders) => levelHeaders[rIdx] ?? "",
                ),
              });
            }
          }
        }
      };
      walk(sortedGroups);
      return out;
    }, [sortedGroups, collapsedGroups, rowHeaders]);

    const containerRef = useRef<HTMLDivElement>(null);
    const [viewport, setViewport] = useState({ top: 0, height: 0 });
    useLayoutEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const update = () =>
        setViewport({ top: el.scrollTop, height: el.clientHeight });
      update();
      el.addEventListener("scroll", update, { passive: true });
      let observer: ResizeObserver | null = null;
      if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(update);
        observer.observe(el);
      }
      return () => {
        el.removeEventListener("scroll", update);
        observer?.disconnect();
      };
    }, []);
    const virtualize =
      viewport.height > 0 && visibleRows.length > VIRTUALIZE_THRESHOLD;
    const windowStart = virtualize
      ? Math.max(
          0,
          Math.floor(viewport.top / ESTIMATED_ROW_HEIGHT) - VIRTUAL_BUFFER_ROWS,
        )
      : 0;
    const windowEnd = virtualize
      ? Math.min(
          visibleRows.length,
          Math.ceil((viewport.top + viewport.height) / ESTIMATED_ROW_HEIGHT) +
            VIRTUAL_BUFFER_ROWS,
        )
      : visibleRows.length;
    const renderedRows = virtualize
      ? visibleRows.slice(windowStart, windowEnd)
      : visibleRows;

    const totalBodyCols =
      visibleRowDimCount + colLabels.length + (showRowTotals ? 1 : 0);

    // TSV export of the current visible layout (headers, visible rows in their
    // current collapse state, totals row) — for copy-to-clipboard.
    useImperativeHandle(ref, () => ({
      getLayoutText: (): string | null =>
        buildPivotTextExport({
          values,
          colLabels,
          colCombos,
          rowDimLabels,
          showLevelLabels,
          visibleRows,
          showRowTotals: !!showRowTotals,
          showColTotals: !!showColTotals,
          renderCell,
          subtotalValue,
          groupClientSum,
          rowTotal,
          backendTotal,
          colTotal,
          grandTotal,
        }),
    }));

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

    const renderCell = (key: string, v: number | null | undefined) => {
      if (v === null || v === undefined) return "";
      return formatCell ? formatCell(key, v) : String(v);
    };

    const cellStyle = {
      textAlign: "center" as const,
      fontVariantNumeric: "tabular-nums" as const,
      p: 0.5,
      borderBottom: "1px solid",
      borderBottomColor: gridBorderColor,
      borderRight: "1px solid",
      borderRightColor: gridBorderColor,
    };
    // Header/subtotal cells use the base size; detail rows are slightly smaller
    // so the table hierarchy reads at a glance.
    const valueCellStyle = (cIdx: number, detail = false) => ({
      sx: cellStyle,
      style: {
        minWidth: getColWidth(`v-${cIdx}`, CELL_MIN_WIDTH),
        fontSize: detail ? DETAIL_FONT_SIZE : HEADER_FONT_SIZE,
      },
    });
    const rowHeaderStyle = {
      position: "sticky" as const,
      zIndex: 2,
      textAlign: "center" as const,
      whiteSpace: "nowrap" as const,
      p: 0.5,
      borderRight: "1px solid",
      borderRightColor: gridBorderColor,
      borderBottom: "1px solid",
      borderBottomColor: gridBorderColor,
    };
    const rowHeaderCellStyle = (level: number, detail = false) => ({
      sx: rowHeaderStyle,
      style: {
        left: rowHeaderOffsets[level],
        minWidth: getColWidth(`rh-${level}`, ROW_HEADER_WIDTH),
        width: getColWidth(`rh-${level}`, ROW_HEADER_WIDTH),
        fontSize: detail ? DETAIL_FONT_SIZE : HEADER_FONT_SIZE,
      },
    });
    const cornerStyle = {
      position: "sticky" as const,
      left: 0,
      zIndex: 3,
      fontSize: HEADER_FONT_SIZE,
      textAlign: "center" as const,
      whiteSpace: "nowrap" as const,
      p: 0.5,
      borderRight: "2px solid",
      borderRightColor: boundaryColor,
      borderBottom: "1px solid",
      borderBottomColor: gridBorderColor,
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
      "&.MuiTableCell-head": { bgcolor: ROW_AREA_BG },
      bgcolor: ROW_AREA_BG,
      color: "text.primary",
      fontWeight: 600,
    };
    // Value area (metric headers, data cells, totals): yellow
    const valueAreaStyle = {
      "&.MuiTableCell-head": { bgcolor: VALUE_AREA_BG },
      bgcolor: VALUE_AREA_BG,
      color: "text.primary",
      fontWeight: 400,
    };

    // Column boundary affordance: hover shows a light vertical line at the
    // cell edge, dragging shows a full-height line following the pointer.
    const resizeHandle = (key: string, width: number): ReactNode => (
      <Box
        component="span"
        aria-hidden
        data-resize-key={key}
        onMouseDown={startResize(key, width)}
        sx={{
          position: "absolute",
          top: 0,
          right: -RESIZE_HANDLE_WIDTH / 2,
          height: "100%",
          width: RESIZE_HANDLE_WIDTH,
          cursor: "col-resize",
          touchAction: "none",
          zIndex: 4,
          "&:hover": {
            bgcolor: "primary.main",
            opacity: 0.35,
          },
        }}
      />
    );

    const colCornerLabel =
      colDimNames.length > 0 ? colDimNames.join(" · ") : "列标签";

    // Group subtotal row (a group with children, collapsed or not).
    const renderGroupRow = (group: PivotGroup): ReactNode => {
      const isCollapsed = collapsedGroups.has(group.collapseKey);
      return (
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
                    ...rowHeaderCellStyle(level).sx,
                    ...rowAreaStyle,
                    fontWeight: 700,
                  }}
                  style={rowHeaderCellStyle(level).style}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
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
                    ...rowHeaderCellStyle(level).sx,
                    ...rowAreaStyle,
                    fontWeight: 700,
                  }}
                  style={rowHeaderCellStyle(level).style}
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
                  ...valueCellStyle(cIdx).sx,
                  ...valueAreaStyle,
                  fontWeight: 600,
                  ...(groupStarts.has(cIdx) ? boundaryStyle : {}),
                }}
                style={valueCellStyle(cIdx).style}
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
              style={{
                minWidth: getColWidth("total", CELL_MIN_WIDTH),
                fontSize: HEADER_FONT_SIZE,
              }}
            >
              {renderCell(
                "__total__",
                rowTotal[group.rows[group.rows.length - 1]],
              )}
            </TableCell>
          )}
        </TableRow>
      );
    };

    // Leaf detail row: slightly smaller font than headers/subtotals.
    const renderLeafRow = (rIdx: number): ReactNode => (
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
                ...rowHeaderCellStyle(level, true).sx,
                ...rowAreaStyle,
                ...(level > 0 ? { fontWeight: 400 } : {}),
              }}
              style={rowHeaderCellStyle(level, true).style}
            >
              {formatDimLabel(rowDimLabels[level], levelHeaders[rIdx])}
            </TableCell>
          ) : null,
        )}
        {colLabels.map((colLabel, cIdx) => (
          <TableCell
            key={`cv-${cIdx}`}
            sx={{
              ...valueCellStyle(cIdx, true).sx,
              ...valueAreaStyle,
              ...(groupStarts.has(cIdx) ? boundaryStyle : {}),
            }}
            style={valueCellStyle(cIdx, true).style}
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
            style={{
              minWidth: getColWidth("total", CELL_MIN_WIDTH),
              fontSize: DETAIL_FONT_SIZE,
            }}
          >
            {renderCell("__total__", rowTotal[rIdx])}
          </TableCell>
        )}
      </TableRow>
    );

    const renderBodyRow = (row: {
      key: string;
      group?: PivotGroup;
      rIdx?: number;
    }): ReactNode =>
      row.group ? renderGroupRow(row.group) : renderLeafRow(row.rIdx ?? 0);

    const spacerRow = (height: number, key: string): ReactNode => (
      <TableRow key={key} sx={{ height }}>
        <TableCell colSpan={totalBodyCols} sx={{ borderBottom: 0, p: 0 }} />
      </TableRow>
    );

    return (
      <TableContainer
        ref={containerRef}
        sx={{ width: "100%", maxHeight: "100%", overflow: "auto" }}
      >
        <Table
          size="small"
          stickyHeader
          sx={{
            border: "1px solid",
            borderColor: gridBorderColor,
          }}
        >
          <TableHead ref={theadRef}>
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
                        }}
                        style={{
                          minWidth: cornerWidth,
                          top: headTops[level] ?? 0,
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
                            }}
                            style={{
                              left: rowHeaderOffsets[rl],
                              minWidth: getColWidth(
                                `rh-${rl}`,
                                ROW_HEADER_WIDTH,
                              ),
                              width: getColWidth(`rh-${rl}`, ROW_HEADER_WIDTH),
                              top: headTops[level] ?? 0,
                            }}
                          >
                            {resizeHandle(
                              `rh-${rl}`,
                              getColWidth(`rh-${rl}`, ROW_HEADER_WIDTH),
                            )}
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
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
                        textAlign: "center",
                        ...(!isLastLevel
                          ? {
                              borderRight: "2px solid",
                              borderRightColor: boundaryColor,
                            }
                          : group.groupStart
                            ? boundaryStyle
                            : {}),
                      }}
                      style={{
                        minWidth: getColWidth(`v-${gi}`, CELL_MIN_WIDTH),
                        fontSize: HEADER_FONT_SIZE,
                        // stack header rows below each other while sticky
                        top: headTops[level] ?? 0,
                      }}
                    >
                      {isLastLevel &&
                        resizeHandle(
                          `v-${gi}`,
                          getColWidth(`v-${gi}`, CELL_MIN_WIDTH),
                        )}
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
                      style={{
                        minWidth: getColWidth("total", CELL_MIN_WIDTH),
                        fontSize: HEADER_FONT_SIZE,
                      }}
                    >
                      {resizeHandle(
                        "total",
                        getColWidth("total", CELL_MIN_WIDTH),
                      )}
                      合计
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableHead>
          <TableBody>
            {virtualize &&
              windowStart > 0 &&
              spacerRow(windowStart * ESTIMATED_ROW_HEIGHT, "spacer-top")}
            {renderedRows.map(renderBodyRow)}
            {virtualize &&
              windowEnd < visibleRows.length &&
              spacerRow(
                (visibleRows.length - windowEnd) * ESTIMATED_ROW_HEIGHT,
                "spacer-bottom",
              )}
            {showColTotals && (
              <TableRow
                sx={{
                  "& td": {
                    borderTop: "2px solid",
                    borderTopColor: boundaryColor,
                  },
                }}
              >
                {/* Totals header: merge all visible dimension columns into one
                  cell, matching the subtotal rows' merged label. */}
                <TableCell
                  key="ct-merged"
                  colSpan={visibleRowDimCount}
                  sx={{
                    bottom: 0,
                    ...rowHeaderStyle,
                    ...rowAreaStyle,
                    zIndex: 3,
                    fontWeight: 700,
                  }}
                  style={{
                    left: 0,
                    fontSize: HEADER_FONT_SIZE,
                  }}
                >
                  合计
                </TableCell>
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
                      style={{ fontSize: HEADER_FONT_SIZE }}
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
                    style={{ fontSize: HEADER_FONT_SIZE }}
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
        {resizeIndicatorX !== null && (
          <Box
            data-testid="resize-indicator"
            sx={{
              position: "fixed",
              top: 0,
              bottom: 0,
              width: 2,
              bgcolor: "primary.main",
              zIndex: 9999,
              pointerEvents: "none",
            }}
            style={{ left: resizeIndicatorX - 1 }}
          />
        )}
      </TableContainer>
    );
  },
);

export default PivotTable;

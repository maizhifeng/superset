/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  Fragment,
  type MutableRefObject,
  type ReactNode,
  type UIEvent,
} from "react";
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { ChartDataRow, QueryResult } from "@/types/api";
import type { MetricFormatMap } from "@/utils/formatNumber";
import {
  anchorSectionLabel,
  compareSectionOrder,
  type AnchorKey,
  type DateWindow,
} from "@/pages/Dashboard/compareStartDate";
import { displayLabel } from "@/pages/Dashboard/compareColumns";
import {
  COL,
  extractName,
  fmtValue,
  type CompareHoveredCell,
  type CompareQuerySnapshot,
  type CompareSecondaryResult,
  type SelectedGame,
} from "@/pages/Dashboard/compareModalModel";
import {
  formatLtvMultiplier,
  type LtvMode,
} from "@/pages/Dashboard/ltvMultiplier";

interface CompareModalResultsProps {
  queryResult: QueryResult;
  intraSecondaryResult: CompareSecondaryResult | null;
  intraSecondaryAggRef: MutableRefObject<ChartDataRow | null>;
  queryFilterSnapshotRef: MutableRefObject<CompareQuerySnapshot | null>;
  sectionAggregateCacheRef: MutableRefObject<Record<string, ChartDataRow>>;
  metricFormatMap: MetricFormatMap;
  ltvMode: LtvMode;
  hoveredCell: CompareHoveredCell | null;
  onHoveredCellChange: (cell: CompareHoveredCell | null) => void;
  resolveDateRange: (
    game: SelectedGame,
    cchName?: string,
    anchor?: AnchorKey,
  ) => DateWindow | undefined;
  scrollRefs: MutableRefObject<Map<string, HTMLDivElement>>;
  syncDisabled: MutableRefObject<boolean>;
}

export function CompareModalResults({
  queryResult,
  intraSecondaryResult,
  intraSecondaryAggRef,
  queryFilterSnapshotRef,
  sectionAggregateCacheRef,
  metricFormatMap,
  ltvMode,
  hoveredCell,
  onHoveredCellChange,
  resolveDateRange,
  scrollRefs,
  syncDisabled,
}: CompareModalResultsProps) {
  const columns = queryResult.columns;
  const columnKeys = columns.map((column) => column.name);
  const renderMetricValue = (colName: string, row: ChartDataRow) => {
    const multiplier = formatLtvMultiplier(colName, row, columnKeys, ltvMode);
    if (multiplier != null) return multiplier;
    return fmtValue(colName, row[colName], metricFormatMap);
  };

  if (queryResult.data.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          py: 2,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          选定周期未找到数据
        </Typography>
      </Box>
    );
  }

  const cellSx = (colIdx: number, zSticky: number) => {
    const base = {
      px: 0.75,
      py: 0.25,
      textAlign: "center",
      fontSize: "0.75rem",
      whiteSpace: "nowrap",
      border: "none",
      outline: "1px solid",
      outlineColor: "divider",
    };
    const left = colStickyLeft[colIdx];
    if (left === undefined) return base;
    return {
      ...base,
      position: "sticky" as const,
      left,
      zIndex: zSticky,
      bgcolor: "background.paper",
    };
  };
  const thSx = (colIdx: number) => {
    const base = cellSx(colIdx, 5);
    const left = colStickyLeft[colIdx];
    return {
      ...base,
      position: "sticky" as const,
      top: 0,
      zIndex: 6,
      bgcolor: "grey.50",
      fontWeight: 700,
      ...(left !== undefined ? { left, zIndex: 7 } : {}),
    };
  };
  const groupSx = (colIdx: number) =>
    ({
      ...cellSx(colIdx, 4),
      fontWeight: colIdx === 0 ? 700 : 400,
    }) as const;
  const dataSx = (colIdx: number) => cellSx(colIdx, 1);

  const colWidths = columns.map((col) => {
    const name = col.name;
    const displayName = col.displayName;
    if (name === COL.papp_name) return 180;
    if (displayName === "月" || displayName === "周" || displayName === "日期")
      return 110;
    if (name === COL.ad_real_cost || name === COL.n_unum) return 80;
    if (name.startsWith("ltv_") || name.startsWith("roi_")) return 70;
    return 72;
  });

  const isDimCol = (name: string, displayName: string) =>
    name === COL.papp_name ||
    name === COL.cch_name ||
    name === COL.cch_name_id ||
    name === COL.channel_name ||
    displayName === "月" ||
    displayName === "周" ||
    displayName === "日期";

  const colStickyLeft = columns.map((col, index) => {
    const displayName = displayLabel(col.name, col.displayName);
    if (!isDimCol(col.name, displayName)) return undefined;
    let left = 0;
    for (let previous = 0; previous < index; previous++) {
      if (
        isDimCol(
          columns[previous].name,
          displayLabel(columns[previous].name, columns[previous].displayName),
        )
      ) {
        left += colWidths[previous];
      }
    }
    return left;
  });

  const colGroup = (
    <colgroup>
      {colWidths.map((width, index) => (
        <col key={index} width={width} />
      ))}
    </colgroup>
  );

  let rowCounter = 0;
  const renderGroup = (
    groupKey: string,
    rows: ChartDataRow[],
    tableName: "primary" | "secondary",
  ) => {
    const isPrimary = tableName === "primary";
    const parent = rows[0];
    const children = rows.slice(1);
    return (
      <Fragment key={groupKey}>
        <TableRow
          sx={{
            bgcolor: isPrimary ? "primary.container" : "surface.variant",
            position: "sticky",
            top: isPrimary ? "28px" : 0,
            zIndex: isPrimary ? 3 : 2,
            "&:hover": { backgroundColor: "action.hover" },
          }}
          onMouseEnter={() =>
            onHoveredCellChange({ table: tableName, row: rowCounter++ })
          }
          onMouseLeave={() => onHoveredCellChange(null)}
        >
          {(() => {
            const dimColCount = columns.filter((column) =>
              isDimCol(
                column.name,
                displayLabel(column.name, column.displayName),
              ),
            ).length;
            let dimColIdx = 0;
            return columns.map((col, colIndex) => {
              const displayName = displayLabel(col.name, col.displayName);
              if (!isDimCol(col.name, displayName)) {
                return (
                  <TableCell
                    key={col.name}
                    colSpan={1}
                    sx={{ ...groupSx(colIndex), fontWeight: 700 }}
                  >
                    {renderMetricValue(col.name, parent ?? {})}
                  </TableCell>
                );
              }
              const isFirstDim = dimColIdx === 0;
              dimColIdx++;
              if (isFirstDim) {
                return (
                  <TableCell
                    key={col.name}
                    colSpan={dimColCount}
                    sx={{ ...groupSx(colIndex), fontWeight: 700 }}
                  >
                    合计
                  </TableCell>
                );
              }
              return null;
            });
          })()}
        </TableRow>
        {children.map((row, rowIndex) => {
          const localIdx = rowCounter++;
          const shouldHighlight =
            hoveredCell &&
            hoveredCell.table !== tableName &&
            hoveredCell.row === localIdx;
          return (
            <TableRow
              key={`${groupKey}-${rowIndex}`}
              sx={{
                bgcolor: shouldHighlight
                  ? "action.selected"
                  : isPrimary
                    ? "primary.container"
                    : "surface.main",
              }}
              onMouseEnter={() =>
                onHoveredCellChange({ table: tableName, row: localIdx })
              }
              onMouseLeave={() => onHoveredCellChange(null)}
            >
              {columns.map((col, colIndex) => (
                <TableCell key={col.name} sx={dataSx(colIndex)}>
                  {renderMetricValue(col.name, row)}
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </Fragment>
    );
  };

  const onScroll = (sourceKey: string, element: HTMLDivElement) => {
    if (syncDisabled.current) return;
    const isHorizontalSource = sourceKey.startsWith("_hz_");
    for (const [key, other] of scrollRefs.current) {
      if (key === sourceKey) continue;
      const isHorizontalTarget = key.startsWith("_hz_");
      if (isHorizontalSource || isHorizontalTarget) {
        if (other.scrollLeft !== element.scrollLeft)
          other.scrollLeft = element.scrollLeft;
      } else {
        if (other.scrollLeft !== element.scrollLeft)
          other.scrollLeft = element.scrollLeft;
        if (other.scrollTop !== element.scrollTop)
          other.scrollTop = element.scrollTop;
      }
    }
  };

  const totalWidth = colWidths.reduce((total, width) => total + width, 0);

  const renderScrollableTable = (
    tableKey: string,
    header: ReactNode,
    sections: ReactNode[],
  ) => (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {header}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        {sections.length === 1 ? (
          <Box
            ref={(element: HTMLDivElement | null) => {
              if (element) scrollRefs.current.set(tableKey, element);
              else scrollRefs.current.delete(tableKey);
            }}
            sx={{ flex: 1, overflow: "auto", minWidth: 0 }}
            onScroll={(event: UIEvent<HTMLDivElement>) =>
              onScroll(tableKey, event.currentTarget)
            }
          >
            {sections[0]}
          </Box>
        ) : (
          sections.map((section, index) => (
            <Box
              key={index}
              sx={{
                flex: "1 1 50%",
                overflow: "auto",
                minWidth: 0,
                minHeight: 0,
                borderTop: index > 0 ? "2px solid" : "none",
                borderColor: "primary.light",
              }}
              ref={(element: HTMLDivElement | null) => {
                if (element)
                  scrollRefs.current.set(tableKey + "_sec" + index, element);
                else scrollRefs.current.delete(tableKey + "_sec" + index);
              }}
              onScroll={(event: UIEvent<HTMLDivElement>) =>
                onScroll(tableKey + "_sec" + index, event.currentTarget)
              }
            >
              {section}
            </Box>
          ))
        )}
      </Box>
      <Box
        ref={(element: HTMLDivElement | null) => {
          if (element) scrollRefs.current.set(tableKey + "_hz", element);
          else scrollRefs.current.delete(tableKey + "_hz");
        }}
        sx={{
          overflowX: "auto",
          overflowY: "hidden",
          bgcolor: "background.paper",
          position: "sticky",
          bottom: 0,
          zIndex: 2,
        }}
        onScroll={(event: UIEvent<HTMLDivElement>) =>
          onScroll(tableKey + "_hz", event.currentTarget)
        }
      >
        <Box sx={{ width: totalWidth, height: 1 }} />
      </Box>
    </Box>
  );

  const renderSection = (
    groupKey: string,
    rows: ChartDataRow[],
    tableName: string,
  ): ReactNode => (
    <Box
      key={groupKey}
      sx={{
        ...(tableName !== "primary"
          ? {
              borderTop: "2px solid",
              borderTopColor: "primary.light",
            }
          : {}),
      }}
    >
      <Table
        size="small"
        sx={{ tableLayout: "fixed", borderCollapse: "collapse" }}
      >
        {colGroup}
        {(tableName === "primary" || tableName === "intra_secondary") && (
          <TableHead>
            <TableRow>
              {columns.map((col, colIndex) => (
                <TableCell key={col.name} sx={thSx(colIndex)}>
                  {displayLabel(col.name, col.displayName)}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
        )}
        <TableBody>
          {(() => {
            rowCounter = 0;
            return (
              <>
                {renderGroup(
                  groupKey,
                  rows,
                  tableName as "primary" | "secondary",
                )}
              </>
            );
          })()}
        </TableBody>
      </Table>
    </Box>
  );

  let intraSecondaryRows: ChartDataRow[] = [];
  if (intraSecondaryResult && intraSecondaryResult.data.length > 0) {
    const apiAgg = intraSecondaryAggRef.current;
    const aggRow: ChartDataRow = {};
    if (apiAgg) {
      Object.assign(aggRow, apiAgg);
      aggRow[COL.papp_name] = "其余渠道汇总";
      aggRow[COL.cch_name] = "其余渠道";
      aggRow[COL.channel_name] = "其余媒体";
    }
    if (!apiAgg) {
      for (const col of columns) {
        const isDim = isDimCol(
          col.name,
          displayLabel(col.name, col.displayName),
        );
        if (!isDim) {
          let sum = 0;
          let hasVal = false;
          for (const row of intraSecondaryResult.data) {
            const value = row[col.name];
            if (typeof value === "number") {
              sum += value;
              hasVal = true;
            }
          }
          aggRow[col.name] = hasVal ? sum : "";
        }
      }
      for (const col of columns) {
        const displayName = displayLabel(col.name, col.displayName);
        if (
          displayName === "日期" ||
          displayName === "周" ||
          displayName === "月"
        ) {
          aggRow[col.name] = "汇总";
          break;
        }
      }
    }
    if (!apiAgg) {
      aggRow[COL.papp_name] = "其余渠道汇总";
      aggRow[COL.cch_name] = "其余渠道";
      aggRow[COL.channel_name] = "其余媒体";
    }
    const detailRows = intraSecondaryResult.data.map((source) => {
      const row: ChartDataRow = {};
      for (const col of columns) {
        const displayName = displayLabel(col.name, col.displayName);
        const isTime =
          displayName === "日期" ||
          displayName === "周" ||
          displayName === "月";
        const raw = source[col.name];
        if (raw != null) {
          row[col.name] =
            isTime && typeof raw === "number"
              ? (() => {
                  const date = new Date(Number.isFinite(raw) ? raw : 0);
                  return !isNaN(date.getTime())
                    ? `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`
                    : String(raw);
                })()
              : raw;
        } else if (col.name === COL.cch_name || col.name === COL.cch_name_id) {
          row[col.name] = "其余渠道";
        } else if (col.name === COL.channel_name) {
          row[col.name] = "其余媒体";
        } else {
          row[col.name] = "";
        }
      }
      return row;
    });
    intraSecondaryRows = [aggRow, ...detailRows];
  }

  const buildSections = () => {
    const snapshot = queryFilterSnapshotRef.current;
    if (!snapshot) return [];
    const data = queryResult.data;
    const snapshotAnchors: AnchorKey[] =
      snapshot.anchors && snapshot.anchors.length > 0
        ? snapshot.anchors
        : ["上线时间"];
    const multiAnchor = snapshotAnchors.length > 1;
    const aggregateCache = sectionAggregateCacheRef.current;

    const buildFor = (
      subset: Record<string, unknown>[],
      anchor?: AnchorKey,
    ) => {
      const labelFor = (label: string) =>
        anchor ? anchorSectionLabel(anchor, label, multiAnchor) : label;
      const snapshotGames = snapshot.games;
      const snapshotCchNames = snapshot.cchNames;
      const snapshotChannels = snapshot.channels;
      const sectionAnchor: AnchorKey = anchor ?? snapshotAnchors[0];
      const isMultiGame = snapshotGames.length > 1;
      const isMultiCch = snapshotCchNames.length > 1;
      const isMultiChannel = snapshotChannels.length > 1;
      const isIntraSnapshot =
        snapshotAnchors.length === 1 &&
        snapshotGames.length === 1 &&
        snapshotCchNames.length <= 1 &&
        snapshotChannels.length <= 1 &&
        (snapshotCchNames.length > 0 || snapshotChannels.length > 0);

      const sectionStart = (
        game: SelectedGame,
        cchName?: string,
      ): string | undefined => {
        const resolvedCch =
          cchName ??
          (snapshotCchNames.length === 1
            ? extractName(snapshotCchNames[0])
            : undefined);
        return resolveDateRange(game, resolvedCch, sectionAnchor)?.start;
      };

      const makeSection = (
        label: string,
        filterFn: (row: Record<string, unknown>) => boolean,
        tableName: string,
        start?: string,
      ) => {
        const allRows = subset.filter(filterFn) as ChartDataRow[];
        if (allRows.length === 0) return null;
        const dataAgg = allRows.find((row) =>
          String(row.id ?? "").startsWith("p_"),
        );
        const detailRows = allRows.filter(
          (row) => !String(row.id ?? "").startsWith("p_"),
        );
        if (detailRows.length === 0) return null;
        const sectionAgg = aggregateCache[label] || dataAgg || null;
        const renderFn = (key: string) => {
          if (sectionAgg) {
            const rows = [sectionAgg, ...detailRows];
            return renderSection(key, rows, tableName);
          }
          return (
            <Box key={key}>
              <Table
                size="small"
                sx={{
                  tableLayout: "fixed",
                  borderCollapse: "collapse",
                }}
              >
                {colGroup}
                {(tableName === "primary" ||
                  tableName === "intra_secondary") && (
                  <TableHead>
                    <TableRow>
                      {columns.map((col, colIndex) => (
                        <TableCell key={col.name} sx={thSx(colIndex)}>
                          {displayLabel(col.name, col.displayName)}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                )}
                <TableBody>
                  {detailRows.map((row, rowIndex) => (
                    <TableRow key={rowIndex} hover>
                      {columns.map((col, colIndex) => (
                        <TableCell key={col.name} sx={dataSx(colIndex)}>
                          {renderMetricValue(col.name, row)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          );
        };
        return {
          rows: detailRows,
          render: renderFn,
          start,
          anchor: sectionAnchor,
          label,
        };
      };

      if (isMultiGame) {
        return snapshotGames.map((game) =>
          makeSection(
            labelFor(game.papp_name),
            (row) => String(row[COL.papp_name] ?? "") === game.papp_name,
            "primary",
            sectionStart(game),
          ),
        );
      }

      if (isMultiCch && isMultiChannel) {
        return snapshotCchNames.flatMap((cch) =>
          snapshotChannels.map((channel) =>
            makeSection(
              labelFor(`${extractName(cch)} × ${channel}`),
              (row) =>
                String(row[COL.cch_name] ?? "") === extractName(cch) &&
                String(row[COL.channel_name] ?? "") === channel,
              "primary",
              sectionStart(snapshotGames[0], extractName(cch)),
            ),
          ),
        );
      }

      if (isMultiCch) {
        return snapshotCchNames.map((cch) =>
          makeSection(
            labelFor(extractName(cch)),
            (row) => String(row[COL.cch_name] ?? "") === extractName(cch),
            "primary",
            sectionStart(snapshotGames[0], extractName(cch)),
          ),
        );
      }

      if (isMultiChannel) {
        return snapshotChannels.map((channel) =>
          makeSection(
            labelFor(channel),
            (row) => String(row[COL.channel_name] ?? "") === channel,
            "primary",
            sectionStart(snapshotGames[0]),
          ),
        );
      }

      if (isIntraSnapshot) {
        const game = snapshotGames[0];
        const gameName = game.papp_name;
        const primaryFilter = (row: Record<string, unknown>) => {
          if (String(row[COL.papp_name] ?? "") !== gameName) return false;
          if (
            snapshotCchNames.length === 1 &&
            (row[COL.cch_name] ?? "") !== "" &&
            String(row[COL.cch_name] ?? "") !== extractName(snapshotCchNames[0])
          )
            return false;
          if (
            snapshotChannels.length === 1 &&
            (row[COL.channel_name] ?? "") !== "" &&
            String(row[COL.channel_name] ?? "") !== snapshotChannels[0]
          )
            return false;
          return true;
        };
        const primarySection = makeSection(
          labelFor(gameName),
          primaryFilter,
          "primary",
          sectionStart(game),
        );
        let secondarySection: ReturnType<typeof makeSection> | null = null;
        if (intraSecondaryResult && intraSecondaryResult.data.length > 0) {
          secondarySection = {
            rows: intraSecondaryRows,
            render: (_key: string) =>
              renderSection(
                "intra_secondary_data",
                intraSecondaryRows,
                "intra_secondary",
              ),
            start: primarySection?.start,
            anchor: sectionAnchor,
            label: `${labelFor(gameName)}（其余渠道）`,
          };
        }
        return [primarySection, secondarySection].filter(Boolean);
      }

      return [
        makeSection(
          labelFor(snapshotGames[0]?.papp_name ?? ""),
          () => true,
          "primary",
          sectionStart(snapshotGames[0]),
        ),
      ];
    };

    if (multiAnchor) {
      return snapshotAnchors.flatMap((anchor) =>
        buildFor(
          data.filter((row) => String(row.__anchor ?? "上线时间") === anchor),
          anchor,
        ),
      );
    }
    return buildFor(data);
  };

  const sections = buildSections()
    .filter(Boolean)
    .map((section) => section!)
    .sort(compareSectionOrder);

  if (sections.length === 0) {
    return (
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          py: 2,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          选定周期未找到数据
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
        }}
      >
        {renderScrollableTable(
          "_primary",
          null,
          sections.map((section, index) => (
            <Box key={index}>{section.render("sec" + index)}</Box>
          )),
        )}
      </Box>
    </Box>
  );
}

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

import { useState } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Checkbox from "@mui/material/Checkbox";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import type { DatasetColumn } from "@/types/api";
import { getColumnPage } from "../datasetUtils";
import type { ModifiedColumns } from "../types";
import TablePagination from "./TablePagination";

const COLUMN_HEADERS = [
  ["名称", "22%"],
  ["数据类型", "14%"],
  ["描述", "30%"],
  ["日期列", "17%", "center"],
  ["仪表板筛选", "17%", "center"],
] as const;

interface ColumnsTabProps {
  columns: DatasetColumn[];
  modifiedColumns: ModifiedColumns;
  search: string;
  onSearchChange: (value: string) => void;
  onColumnUpdate: (columnId: number, update: Partial<DatasetColumn>) => void;
  onCopyColumnName: (name: string, type?: string) => Promise<void>;
}

export default function ColumnsTab({
  columns,
  modifiedColumns,
  search,
  onSearchChange,
  onColumnUpdate,
  onCopyColumnName,
}: ColumnsTabProps) {
  const [page, setPage] = useState(0);
  const visibleColumns = getColumnPage(columns, search, page);

  return (
    <>
      <Box sx={{ px: 0.5, pb: 1 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="搜索数据列..."
          value={search}
          onChange={(event) => {
            onSearchChange(event.target.value);
            setPage(0);
          }}
          sx={{
            maxWidth: 320,
            "& .MuiOutlinedInput-root": { fontSize: "0.8125rem" },
          }}
        />
      </Box>
      <TableContainer
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          flex: 1,
          overflow: "auto",
        }}
      >
        <Table size="small" stickyHeader sx={{ tableLayout: "fixed" }}>
          <TableHead>
            <TableRow>
              {COLUMN_HEADERS.map(([heading, width, align]) => (
                <TableCell
                  key={heading}
                  sx={{
                    fontWeight: 700,
                    bgcolor: "grey.50",
                    fontSize: "0.75rem",
                    width,
                    py: 1,
                    textAlign: align,
                  }}
                >
                  {heading}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleColumns.map((column) => {
              const modified = modifiedColumns[column.id];
              const isDttm = modified?.is_dttm ?? !!column.is_dttm;
              const hasModification = Object.prototype.hasOwnProperty.call(
                modifiedColumns,
                column.id,
              );
              const currentExtra = hasModification
                ? (modified?.extra ?? null)
                : column.extra;
              let parsed: Record<string, unknown> = {};
              try {
                parsed = currentExtra ? JSON.parse(currentExtra) : {};
              } catch {
                parsed = {};
              }
              const dashboardFilter = parsed.dashboard_filter === true;

              return (
                <TableRow
                  key={column.id}
                  hover
                  sx={{ "&:last-child td": { border: 0 } }}
                >
                  <TableCell sx={{ fontSize: "0.75rem", fontWeight: 500 }}>
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 0.25,
                      }}
                    >
                      {column.column_name}
                      <Tooltip title="复制列名">
                        <IconButton
                          size="small"
                          aria-label={`复制列名 ${column.column_name}`}
                          sx={{ p: 0.25 }}
                          onClick={() =>
                            void onCopyColumnName(
                              column.column_name,
                              column.type ?? "",
                            )
                          }
                        >
                          <ContentCopyIcon
                            sx={{
                              fontSize: 13,
                              color: "text.disabled",
                            }}
                          />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.75rem" }}>
                    <Chip
                      label={column.type || "—"}
                      size="small"
                      variant="outlined"
                      sx={{
                        height: 20,
                        fontSize: "0.75rem",
                        maxWidth: 120,
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.75rem" }}>
                    {column.description ?? ""}
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.75rem", textAlign: "center" }}>
                    <Checkbox
                      size="small"
                      checked={isDttm}
                      onChange={(_, checked) =>
                        onColumnUpdate(column.id, { is_dttm: checked })
                      }
                      sx={{ p: 0.25 }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: "0.75rem", textAlign: "center" }}>
                    <Checkbox
                      size="small"
                      checked={dashboardFilter}
                      onChange={(_, checked) => {
                        const newExtra = JSON.stringify({
                          ...parsed,
                          dashboard_filter: checked,
                        });
                        onColumnUpdate(column.id, { extra: newExtra });
                      }}
                      sx={{ p: 0.25 }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        total={columns.length}
        page={page}
        onPageChange={setPage}
      />
    </>
  );
}

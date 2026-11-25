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

import { Box, Button, Paper } from "@mui/material";

export interface SchemaContextMenuState {
  mouseX: number;
  mouseY: number;
  table?: string;
  column?: string;
}

const menuButtonSx = {
  justifyContent: "flex-start",
  px: 2,
  py: 0.75,
  textTransform: "none",
  fontSize: "0.8125rem",
};

export default function SchemaContextMenu({
  ctxMenu,
  schema,
  columnCache,
  onInsertColumn,
  onInsertTable,
  onCopy,
  onClose,
}: {
  ctxMenu: SchemaContextMenuState | null;
  schema: string;
  columnCache: Record<string, Record<string, string[]>>;
  onInsertColumn: (table: string, column: string) => void;
  onInsertTable: (table: string) => void;
  onCopy: (text: string) => void | Promise<void>;
  onClose: () => void;
}) {
  if (!ctxMenu) return null;
  return (
    <Box
      component="div"
      onContextMenu={(event) => event.preventDefault()}
      sx={{ position: "fixed", zIndex: (theme) => theme.zIndex.modal }}
    >
      <Paper
        sx={{
          position: "absolute",
          top: ctxMenu.mouseY,
          left: ctxMenu.mouseX,
          py: 0.5,
          minWidth: 180,
          zIndex: (theme) => theme.zIndex.modal + 1,
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {ctxMenu.column && ctxMenu.table ? (
          <>
            <Button
              fullWidth
              sx={menuButtonSx}
              onClick={() => {
                onInsertColumn(ctxMenu.table!, ctxMenu.column!);
                onClose();
              }}
            >
              插入列：{ctxMenu.table}.{ctxMenu.column}
            </Button>
            <Button
              fullWidth
              sx={menuButtonSx}
              onClick={() => void onCopy(`${ctxMenu.table}.${ctxMenu.column}`)}
            >
              复制列名
            </Button>
          </>
        ) : ctxMenu.table ? (
          <>
            <Button
              fullWidth
              sx={menuButtonSx}
              onClick={() => {
                onInsertTable(ctxMenu.table!);
                onClose();
              }}
            >
              插入表：FROM {ctxMenu.table}
            </Button>
            <Button
              fullWidth
              sx={menuButtonSx}
              onClick={() => void onCopy(ctxMenu.table!)}
            >
              复制表名
            </Button>
            <Button
              fullWidth
              sx={menuButtonSx}
              onClick={() =>
                void onCopy(
                  schema
                    ? `SELECT * FROM ${schema}.${ctxMenu.table!};`
                    : `SELECT * FROM ${ctxMenu.table!};`,
                )
              }
            >
              复制 SELECT
            </Button>
            <Button
              fullWidth
              sx={menuButtonSx}
              onClick={() => {
                const columns =
                  (schema && columnCache[schema]?.[ctxMenu.table!]) || [];
                void onCopy(
                  columns.length ? columns.join(", ") : "（未加载列）",
                );
              }}
            >
              复制全部列名
            </Button>
          </>
        ) : null}
      </Paper>
    </Box>
  );
}

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
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  TextField,
} from "@mui/material";
import type { VisualQueryModel } from "./visual/types";

export type VisualModeSwitchDialogState =
  { kind: "no-model" } | { kind: "modified"; model: VisualQueryModel } | null;

export type PendingContextState =
  | { kind: "database"; value: number }
  | { kind: "schema"; value: string }
  | null;

export default function SqlLabDialogs({
  saveQueryOpen,
  saveQuerySaving,
  saveQueryLabel,
  saveQueryError,
  onSaveQueryOpenChange,
  onSaveQueryLabelChange,
  onSaveQuery,
  switchDialog,
  onSwitchDialogClose,
  onApplyVisualModel,
  onNewVisualQuery,
  pendingContext,
  onPendingContextClose,
  onConfirmContextChange,
}: {
  saveQueryOpen: boolean;
  saveQuerySaving: boolean;
  saveQueryLabel: string;
  saveQueryError: string | null;
  onSaveQueryOpenChange: (open: boolean) => void;
  onSaveQueryLabelChange: (value: string) => void;
  onSaveQuery: () => void;
  switchDialog: VisualModeSwitchDialogState;
  onSwitchDialogClose: () => void;
  onApplyVisualModel: (model: VisualQueryModel) => void;
  onNewVisualQuery: () => void;
  pendingContext: PendingContextState;
  onPendingContextClose: () => void;
  onConfirmContextChange: () => void;
}) {
  return (
    <>
      <Dialog
        open={saveQueryOpen}
        onClose={() => !saveQuerySaving && onSaveQueryOpenChange(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>保存查询</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            label="查询名称"
            value={saveQueryLabel}
            onChange={(event) => onSaveQueryLabelChange(event.target.value)}
            size="small"
            sx={{ mt: 1 }}
          />
          {saveQueryError && (
            <Alert severity="error" sx={{ mt: 1.5, borderRadius: 1.5 }}>
              {saveQueryError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => onSaveQueryOpenChange(false)}
            disabled={saveQuerySaving}
          >
            取消
          </Button>
          <Button
            variant="contained"
            disabled={saveQuerySaving || !saveQueryLabel.trim()}
            onClick={onSaveQuery}
          >
            {saveQuerySaving ? "保存中..." : "保存"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={switchDialog !== null}
        onClose={onSwitchDialogClose}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {switchDialog?.kind === "modified"
            ? "SQL 已被手工修改"
            : "无法转换为可视化查询"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {switchDialog?.kind === "modified"
              ? "当前 SQL 与可视化模型生成的语句不一致。继续进入可视化模式将丢弃手工修改（模型本身不受影响）。"
              : "当前 SQL 未携带可视化模型注释（手写 SQL 无法自动反解）。可新建一个可视化查询，或继续使用 SQL 编辑器。"}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={onSwitchDialogClose}>取消</Button>
          {switchDialog?.kind === "modified" ? (
            <Button
              variant="contained"
              color="warning"
              onClick={() => {
                onApplyVisualModel(switchDialog.model);
                onSwitchDialogClose();
              }}
            >
              继续（丢弃手改）
            </Button>
          ) : (
            <Button variant="contained" onClick={onNewVisualQuery}>
              新建可视化查询
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog
        open={pendingContext !== null}
        onClose={onPendingContextClose}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>重置可视化查询？</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {pendingContext?.kind === "database"
              ? "切换数据库会清空当前的可视化查询配置（数据表、关联、字段、筛选与汇总）。"
              : "切换模式会清空当前的可视化查询配置（数据表、关联、字段、筛选与汇总）。"}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={onPendingContextClose}>取消</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={onConfirmContextChange}
          >
            切换并重置
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

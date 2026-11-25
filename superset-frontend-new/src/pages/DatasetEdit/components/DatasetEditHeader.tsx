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
import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CodeIcon from "@mui/icons-material/Code";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import FunctionsIcon from "@mui/icons-material/Functions";
import type { DatasetDetail } from "@/types/api";
import { useDatasetClipboard } from "../hooks/useDatasetClipboard";

interface DatasetEditHeaderProps {
  id: string | undefined;
  dataset: DatasetDetail | null;
  tableName: string;
  onTableNameChange: (value: string) => void;
  onBack: () => void;
  onSave: () => void;
}

interface CopyMenuItem {
  key: string;
  label: string;
  icon: ReactNode;
  action: () => Promise<void>;
}

export default function DatasetEditHeader({
  id,
  dataset,
  tableName,
  onTableNameChange,
  onBack,
  onSave,
}: DatasetEditHeaderProps) {
  const [copyMenuAnchor, setCopyMenuAnchor] = useState<HTMLElement | null>(
    null,
  );
  const {
    handleCopyId,
    handleCopySql,
    handleCopyColumnNames,
    handleCopyAllMetricNames,
  } = useDatasetClipboard(id, dataset);
  const copyItems: CopyMenuItem[] = [
    {
      key: "id",
      label: "复制数据集 ID",
      icon: <ContentCopyIcon sx={{ fontSize: 16 }} />,
      action: handleCopyId,
    },
    {
      key: "sql",
      label: "复制查询 SQL",
      icon: <CodeIcon sx={{ fontSize: 16 }} />,
      action: handleCopySql,
    },
    {
      key: "columns",
      label: "复制全部列名",
      icon: <ViewColumnIcon sx={{ fontSize: 16 }} />,
      action: handleCopyColumnNames,
    },
    {
      key: "metrics",
      label: "复制全部指标名",
      icon: <FunctionsIcon sx={{ fontSize: 16 }} />,
      action: handleCopyAllMetricNames,
    },
  ];

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.5,
        px: 2,
        py: 0.75,
        borderBottom: "1px solid",
        borderColor: "divider",
        bgcolor: "grey.50",
        flexShrink: 0,
        mx: -3,
        mb: 2,
      }}
    >
      <IconButton
        size="small"
        aria-label="返回"
        onClick={onBack}
        sx={{ bgcolor: "grey.200", color: "text.primary" }}
      >
        <ArrowBackIcon sx={{ fontSize: 20 }} />
      </IconButton>
      <Tooltip title="复制">
        <IconButton
          size="small"
          aria-label="复制"
          onClick={(event) => setCopyMenuAnchor(event.currentTarget)}
          sx={{ color: "text.secondary" }}
        >
          <ContentCopyIcon sx={{ fontSize: 18 }} />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={copyMenuAnchor}
        open={Boolean(copyMenuAnchor)}
        onClose={() => setCopyMenuAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
      >
        {copyItems.map((item) => (
          <MenuItem
            key={item.key}
            onClick={() => {
              setCopyMenuAnchor(null);
              void item.action();
            }}
            sx={{ fontSize: "0.8125rem" }}
          >
            <ListItemIcon sx={{ minWidth: 30 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </MenuItem>
        ))}
      </Menu>
      <TextField
        placeholder="数据集名称..."
        slotProps={{ htmlInput: { "aria-label": "数据集名称" } }}
        value={tableName}
        onChange={(event) => onTableNameChange(event.target.value)}
        variant="standard"
        sx={{
          minWidth: 120,
          "& .MuiInputBase-input": {
            fontSize: "1.125rem",
            fontWeight: 700,
            py: 0.5,
          },
          "& .MuiInputBase-root::before": {
            borderBottomColor: "divider",
            borderBottomWidth: 1,
          },
          "& .MuiInputBase-root:hover::before": {
            borderBottomColor: "primary.light",
          },
          "& .MuiInputBase-root::after": {
            borderBottomColor: "primary.main",
          },
        }}
      />
      <Box sx={{ flex: 1 }} />
      <Button
        variant="contained"
        size="small"
        startIcon={<SaveIcon />}
        onClick={onSave}
      >
        保存
      </Button>
    </Box>
  );
}

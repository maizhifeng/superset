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

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import ChevronLeft from "@mui/icons-material/ChevronLeft";
import ChevronRight from "@mui/icons-material/ChevronRight";
import {
  ANCHORS,
  ANCHOR_LABELS,
  type AnchorKey,
} from "@/pages/Dashboard/compareStartDate";
import { PERIOD_DAYS } from "@/pages/Dashboard/compareModalModel";
import type { LtvMode } from "@/pages/Dashboard/ltvMultiplier";

interface CompareModalControlsProps {
  selectedAnchors: AnchorKey[];
  periodDays: number;
  timeGrain: string;
  ltvMode: LtvMode;
  loading: boolean;
  queryDisabled: boolean;
  onToggleAnchor: (key: AnchorKey) => void;
  onPeriodDaysChange: (days: number) => void;
  onTimeGrainChange: (grain: string) => void;
  onLtvModeChange: (mode: LtvMode) => void;
  onQuery: () => void;
  onScrollByStep: (direction: -1 | 1) => void;
}

export function CompareModalControls({
  selectedAnchors,
  periodDays,
  timeGrain,
  ltvMode,
  loading,
  queryDisabled,
  onToggleAnchor,
  onPeriodDaysChange,
  onTimeGrainChange,
  onLtvModeChange,
  onQuery,
  onScrollByStep,
}: CompareModalControlsProps) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        columnGap: 1.5,
        rowGap: 0.5,
      }}
    >
      <Box
        sx={{
          position: "relative",
          display: "flex",
          gap: 0.5,
          alignItems: "center",
        }}
      >
        <Typography sx={{ fontSize: "0.7rem", color: "text.secondary" }}>
          基准
        </Typography>
        {ANCHORS.map((anchor) => {
          const active = selectedAnchors.includes(anchor.key);
          return (
            <Chip
              key={anchor.key}
              label={anchor.label}
              size="small"
              variant={active ? "filled" : "outlined"}
              color={active ? "secondary" : "default"}
              onClick={() => onToggleAnchor(anchor.key)}
              title="可多选，多选时按轮次分表对比（外对比）"
              sx={{ cursor: "pointer", minWidth: 28 }}
            />
          );
        })}
        {selectedAnchors.length > 1 && (
          <Box
            sx={{
              position: "absolute",
              top: -8,
              right: -8,
              px: 0.75,
              py: 0.15,
              borderRadius: "3px",
              bgcolor: "error.main",
              color: "common.white",
              fontSize: "0.65rem",
              fontWeight: 700,
              whiteSpace: "nowrap",
              zIndex: 10,
              pointerEvents: "none",
              boxShadow: "var(--mui-palette-shadow-sm)",
            }}
          >
            <Box
              sx={{
                display: "inline-block",
                width: 6,
                height: 6,
                borderRadius: "50%",
                bgcolor: "common.white",
                mr: 0.5,
                verticalAlign: "middle",
              }}
            />
            外对比
          </Box>
        )}
      </Box>
      <Box
        sx={{
          display: "flex",
          gap: 1,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {PERIOD_DAYS.map((days) => (
          <Chip
            key={days}
            label={`${selectedAnchors.length > 1 ? "各轮次后" : `${ANCHOR_LABELS[selectedAnchors[0]]}后`} ${days} 天`}
            size="small"
            variant={periodDays === days ? "filled" : "outlined"}
            color={periodDays === days ? "primary" : "default"}
            onClick={() => onPeriodDaysChange(days)}
            sx={{ cursor: "pointer" }}
          />
        ))}
      </Box>
      <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
        {["P1D", "P1W", "P1M"].map((grain) => (
          <Chip
            key={grain}
            label={grain === "P1D" ? "日" : grain === "P1W" ? "周" : "月"}
            size="small"
            variant={timeGrain === grain ? "filled" : "outlined"}
            color={timeGrain === grain ? "secondary" : "default"}
            onClick={() => onTimeGrainChange(grain)}
            sx={{ cursor: "pointer", minWidth: 28 }}
          />
        ))}
      </Box>
      <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
        {(["raw", "first", "prev"] as const).map((mode) => (
          <Chip
            key={mode}
            label={
              mode === "raw"
                ? "原值"
                : mode === "first"
                  ? "首日倍率"
                  : "昨日倍率"
            }
            size="small"
            variant={ltvMode === mode ? "filled" : "outlined"}
            color={ltvMode === mode ? "secondary" : "default"}
            onClick={() => onLtvModeChange(mode)}
            sx={{ cursor: "pointer", minWidth: 28 }}
          />
        ))}
      </Box>
      <Button
        variant="contained"
        size="small"
        onClick={onQuery}
        disabled={queryDisabled}
        title=""
        sx={{ ml: 1 }}
      >
        {loading ? "..." : "查询"}
      </Button>
      <IconButton
        size="small"
        onClick={() => onScrollByStep(-1)}
        title="向左滚动"
      >
        <ChevronLeft />
      </IconButton>
      <IconButton
        size="small"
        onClick={() => onScrollByStep(1)}
        title="向右滚动"
      >
        <ChevronRight />
      </IconButton>
    </Box>
  );
}

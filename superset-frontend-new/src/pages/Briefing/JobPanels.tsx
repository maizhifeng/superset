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

import { useEffect, useRef } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import Collapse from "@mui/material/Collapse";
import { keyframes } from "@mui/material";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import useReducedMotion from "@/hooks/useReducedMotion";
import { duration as durationTokens, ease as easeTokens } from "@/theme/tokens";
import {
  ALERT_LEVEL_COLOR,
  BRIEFING_CSS_COLORS,
  JOB_STATUS_COLOR,
  JOB_STATUS_LABEL,
  type JobStatus,
} from "./reportStyles";
import type { JobLog } from "./jobTypes";

const TERMINAL_BG = "#0d1117";
const TERMINAL_TEXT = "#c9d1d9";
const TERMINAL_MUTED = "#8b949e";
const TERMINAL_HOVER = "rgba(255,255,255,0.04)";

const LOG_LEVEL_COLOR: Record<string, string> = {
  ...ALERT_LEVEL_COLOR,
  success: BRIEFING_CSS_COLORS.statusSuccess,
};

const statusPulse = keyframes`
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.82); }
`;
const railSweep = keyframes`
  from { transform: translateX(-100%); }
  to { transform: translateX(320%); }
`;

export default function JobLogPanel({
  logs,
  status,
  expanded,
  onToggle,
}: {
  logs: JobLog[];
  status: JobStatus;
  expanded: boolean;
  onToggle: () => void;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (boxRef.current && expanded) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [logs, expanded]);

  const lastLine = logs[logs.length - 1]?.message;

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 2,
        bgcolor: TERMINAL_BG,
        color: TERMINAL_TEXT,
        overflow: "hidden",
      }}
    >
      <Box
        onClick={onToggle}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          py: 0.75,
          cursor: "pointer",
          userSelect: "none",
          "&:hover": { bgcolor: TERMINAL_HOVER },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            flex: 1,
            minWidth: 0,
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: JOB_STATUS_COLOR[status], fontWeight: 600 }}
          >
            执行日志 · {JOB_STATUS_LABEL[status]}
          </Typography>
          {!expanded && lastLine && (
            <Typography variant="caption" noWrap sx={{ color: TERMINAL_MUTED }}>
              {lastLine}
            </Typography>
          )}
        </Box>
        {expanded ? (
          <ExpandLessIcon sx={{ fontSize: 18, color: TERMINAL_MUTED }} />
        ) : (
          <ExpandMoreIcon sx={{ fontSize: 18, color: TERMINAL_MUTED }} />
        )}
      </Box>
      <Collapse
        in={expanded}
        timeout={{
          enter: durationTokens.standard,
          exit: durationTokens.standard,
        }}
        unmountOnExit={false}
      >
        <Box
          ref={boxRef}
          sx={{
            maxHeight: 200,
            overflowY: "auto",
            px: 1.5,
            pb: 1.5,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
            opacity: expanded ? 1 : 0,
            transition: `opacity ${durationTokens.quick}ms ${easeTokens.standard}`,
          }}
        >
          {logs.length === 0 && status === "running" && (
            <Box sx={{ color: TERMINAL_MUTED }}>等待任务启动…</Box>
          )}
          {logs.map((log, i) => (
            <Box
              key={`${log.ts}-${i}`}
              sx={{
                whiteSpace: "pre-wrap",
                lineHeight: 1.6,
                animation: `briefingLogLineIn ${durationTokens.micro}ms ease-out both`,
              }}
            >
              <span style={{ color: TERMINAL_MUTED }}>
                [{log.ts.split("T")[1] ?? log.ts}]{" "}
              </span>
              <span
                style={{ color: LOG_LEVEL_COLOR[log.level] ?? TERMINAL_TEXT }}
              >
                {log.message}
              </span>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Paper>
  );
}

export function JobStatusBar({
  status,
  elapsedSec,
  lastLog,
}: {
  status: JobStatus;
  elapsedSec: number;
  lastLog: JobLog | null;
}) {
  const reduced = useReducedMotion();
  const running = status === "running";
  const color = JOB_STATUS_COLOR[status];

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 2,
        overflow: "hidden",
        bgcolor: BRIEFING_CSS_COLORS.surfaceMain,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.25,
          px: 1.5,
          py: 1,
        }}
      >
        <Box
          aria-hidden
          sx={{
            flexShrink: 0,
            width: 8,
            height: 8,
            borderRadius: "50%",
            bgcolor: color,
            animation:
              running && !reduced
                ? `${statusPulse} 1.4s ease-in-out infinite`
                : "none",
          }}
        />
        <Typography variant="body2" sx={{ fontWeight: 600, color }}>
          {JOB_STATUS_LABEL[status]}
        </Typography>
        {running && (
          <Typography
            variant="body2"
            sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums" }}
          >
            已运行 {Math.floor(elapsedSec / 60)} 分{" "}
            {String(elapsedSec % 60).padStart(2, "0")} 秒
          </Typography>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }} />
        {lastLog && (
          <Typography
            variant="caption"
            noWrap
            sx={{ color: "text.secondary", maxWidth: { xs: 140, md: 420 } }}
          >
            {lastLog.message}
          </Typography>
        )}
      </Box>
      {running && (
        <Box
          sx={{
            position: "relative",
            height: 2,
            bgcolor: "action.hover",
            overflow: "hidden",
          }}
        >
          <Box
            aria-hidden
            sx={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: "30%",
              bgcolor: "primary.main",
              animation: reduced
                ? "none"
                : `${railSweep} 1.6s ease-in-out infinite`,
            }}
          />
        </Box>
      )}
    </Paper>
  );
}

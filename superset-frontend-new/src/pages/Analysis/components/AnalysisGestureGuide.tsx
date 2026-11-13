/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { useState } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import { alpha } from "@mui/material/styles";
import AdsClickIcon from "@mui/icons-material/AdsClick";

export interface GestureGuideAnchor {
  left: number | string;
  top: number | string;
}

export interface AnalysisGestureGuideProps {
  /** localStorage key; once tapped the gesture never shows again. */
  storageKey: string;
  /** Pixel/CSS anchor of the point the gesture points at. */
  anchor: GestureGuideAnchor | null;
  /** Hide while the anchored content (e.g. anomaly bars) is not rendered. */
  visible?: boolean;
  /** Picture the gesture points at, for assistive technology only. */
  ariaLabel?: string;
  /** CSS transform used to place the hand relative to the anchor. */
  transform?: string;
  /** Called after the hand is tapped, so callers can clear paired highlights. */
  onDismiss?: () => void;
}

function isDismissed(storageKey: string): boolean {
  try {
    return localStorage.getItem(storageKey) === "1";
  } catch {
    // Without storage the guide would reappear on every render; stay quiet.
    return true;
  }
}

function rememberDismissed(storageKey: string): void {
  try {
    localStorage.setItem(storageKey, "1");
  } catch {
    // Storage unavailable (private mode / sandbox): dismiss for this mount.
  }
}

/**
 * Gesture-only hint: a tapping hand pointing down at the point it explains.
 *
 * The emoji hand reads as a "tap here" gesture at small sizes, so the guide
 * needs no copy; tapping it acknowledges the hint and persists the dismissal.
 */
export default function AnalysisGestureGuide({
  storageKey,
  anchor,
  visible = true,
  ariaLabel = "点击此处查看异常构成与下钻",
  transform = "translate(-50%, -50%)",
  onDismiss,
}: AnalysisGestureGuideProps) {
  const [dismissed, setDismissed] = useState(() => isDismissed(storageKey));
  const dismiss = () => {
    rememberDismissed(storageKey);
    setDismissed(true);
    onDismiss?.();
  };

  if (!visible || dismissed || !anchor) return null;

  return (
    <Box
      sx={{
        position: "absolute",
        left: anchor.left,
        top: anchor.top,
        transform,
        pointerEvents: "auto",
        zIndex: 6,
      }}
    >
      <IconButton
        aria-label={ariaLabel}
        onClick={dismiss}
        sx={{
          position: "relative",
          p: 0.35,
          bgcolor: (theme) => alpha(theme.palette.common.white, 0.96),
          border: "1px solid",
          borderColor: (theme) => alpha(theme.palette.primary.main, 0.5),
          boxShadow: 3,
          overflow: "visible",
          "@keyframes gestureTap": {
            "0%, 100%": { transform: "translateY(0) scale(1)" },
            "45%": { transform: "translateY(3px) scale(0.9)" },
            "70%": { transform: "translateY(0) scale(1)" },
          },
          animation: "gestureTap 1.5s ease-in-out infinite",
          "&:hover": {
            bgcolor: (theme) => alpha(theme.palette.common.white, 1),
          },
        }}
      >
        <AdsClickIcon sx={{ fontSize: 21, display: "block" }} />
      </IconButton>
    </Box>
  );
}

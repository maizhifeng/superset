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

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import type { ReportChapter } from "./chapters";

const CHAPTER_SLANT_PX = 9;
const CHAPTER_STEP_MIN_WIDTH = 92;

function useActiveChapter(chapters: ReportChapter[]): string {
  const [activeId, setActiveId] = useState(chapters[0]?.id ?? "");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        visible.sort(
          (left, right) =>
            left.boundingClientRect.top - right.boundingClientRect.top,
        );
        const next = visible[0].target.id;
        setActiveId((previous) => (previous === next ? previous : next));
      },
      { rootMargin: "-15% 0px -75% 0px", threshold: 0 },
    );
    chapters.forEach((chapter) => {
      const element = document.getElementById(chapter.id);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [chapters]);
  return activeId;
}

export default function ChapterNav({
  chapters,
  onJump,
}: {
  chapters: ReportChapter[];
  onJump: (id: string) => void;
}) {
  const activeId = useActiveChapter(chapters);
  const activeIndex = Math.max(
    0,
    chapters.findIndex((chapter) => chapter.id === activeId),
  );
  return (
    <Box
      component="nav"
      aria-label="章节导航"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: "2px",
        minWidth: 0,
        flexShrink: 0,
      }}
    >
      {chapters.map((chapter, index) => {
        const active = index === activeIndex;
        const reached = index <= activeIndex;
        const first = index === 0;
        const last = index === chapters.length - 1;
        const cut = `polygon(${first ? 0 : CHAPTER_SLANT_PX}px 0, 100% 0, calc(100% - ${
          last ? 0 : CHAPTER_SLANT_PX
        }px) 100%, 0 100%)`;
        return (
          <Box
            key={chapter.id}
            component="button"
            type="button"
            onClick={() => onJump(chapter.id)}
            aria-current={active ? "step" : undefined}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 26,
              minWidth: CHAPTER_STEP_MIN_WIDTH,
              border: 0,
              font: "inherit",
              fontSize: "0.8125rem",
              fontWeight: active ? 700 : 500,
              lineHeight: 1,
              letterSpacing: 0,
              px: `${CHAPTER_SLANT_PX + 9}px`,
              clipPath: cut,
              cursor: "pointer",
              whiteSpace: "nowrap",
              bgcolor: active
                ? "primary.main"
                : reached
                  ? "primary.container"
                  : "action.hover",
              color: active
                ? "primary.contrastText"
                : reached
                  ? "primary.onContainer"
                  : "text.disabled",
              transition: "background-color 150ms ease, color 150ms ease",
              "&:hover": {
                bgcolor: active ? "primary.dark" : "action.selected",
                color: active ? "primary.contrastText" : "text.primary",
              },
            }}
          >
            {chapter.label}
          </Box>
        );
      })}
    </Box>
  );
}

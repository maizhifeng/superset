import { useRef, useMemo, useCallback, useState, useEffect } from "react";
import Collapse from "@mui/material/Collapse";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Popper from "@mui/material/Popper";
import Paper from "@mui/material/Paper";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FilterListIcon from "@mui/icons-material/FilterList";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import type { FilterConfig, FilterState } from "./types";
import FilterPanel from "./FilterPanel";

interface DashboardFilterDrawerProps {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  filters: FilterConfig[];
  filterState: FilterState;
  onFilterChange: (id: string, value: unknown) => void;
  onClearAll: () => void;
  pendingFilterIds?: string[];
}

const SWIPE_THRESHOLD = 30;

export default function DashboardFilterDrawer({
  open,
  onClose,
  onOpen,
  filters,
  filterState,
  onFilterChange,
  onClearAll: _onClearAll,
  pendingFilterIds,
}: DashboardFilterDrawerProps) {
  const touchStartY = useRef(0);
  const touchStartX = useRef(0);
  const barRef = useRef<HTMLDivElement>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [guideDismissed, setGuideDismissed] = useState(() => {
    try {
      return localStorage.getItem("filter_guide_dismissed") === "1";
    } catch {
      return false;
    }
  });

  const activeCount = useMemo(() => {
    let count = 0;
    for (const s of Object.values(filterState)) {
      const v = s.value;
      if (v === undefined || v === null || v === "") continue;
      if (Array.isArray(v) && v.length === 0) continue;
      count++;
    }
    return count;
  }, [filterState]);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    for (const f of filters) {
      const state = filterState[f.id];
      if (!state) continue;
      const v = state.value;
      if (v === undefined || v === null || v === "") continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (parts.length >= 2) break;

      let display: string;
      if (Array.isArray(v)) {
        if (v.length <= 2) {
          display = v.map((x) => String(x)).join(", ");
        } else {
          display = `${v.length} 项`;
        }
      } else if (typeof v === "string") {
        display = v;
      } else {
        display = String(v);
      }
      parts.push(`${f.name}: ${display}`);
    }
    if (parts.length === 0) return "筛选";
    const overflow = activeCount - parts.length;
    return overflow > 0
      ? `${parts.join(" | ")} +${overflow}`
      : parts.join(" | ");
  }, [filters, filterState, activeCount]);

  useEffect(() => {
    if (open || guideDismissed) return;
    const timer = setTimeout(() => setShowGuide(true), 3000);
    return () => clearTimeout(timer);
  }, [open, guideDismissed]);

  const handleSkipGuide = useCallback(() => {
    setShowGuide(false);
    setGuideDismissed(true);
    try {
      localStorage.setItem("filter_guide_dismissed", "1");
    } catch {
      /* storage unavailable */
    }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const dy = e.changedTouches[0].clientY - touchStartY.current;
      const dx = Math.abs(e.changedTouches[0].clientX - touchStartX.current);
      if (dx > dy * 2) return;
      if (dy > SWIPE_THRESHOLD && !open) {
        onOpen();
      } else if (dy < -SWIPE_THRESHOLD && open) {
        onClose();
      }
    },
    [open, onOpen, onClose],
  );

  return (
    <Box
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      sx={{
        width: "100%",
        position: "sticky",
        top: 0,
        zIndex: 10,
        bgcolor: "background.paper",
        boxShadow: open ? "none" : "var(--mui-palette-shadow-md)",
        transition: "box-shadow 200ms",
      }}
    >
      <Box
        ref={barRef}
        onClick={() => {
          setShowGuide(false);
          if (open) {
            onClose();
          } else {
            onOpen();
          }
        }}
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          cursor: "pointer",
          gap: 0.75,
          py: 0.15,
          px: 2,
          width: "100%",
          borderBottom: "2px solid",
          borderColor: open ? "primary.light" : "divider",
          bgcolor: open ? "background.paper" : "action.hover",
          transition:
            "background-color 200ms, border-color 200ms, border-bottom-width 200ms",
          "&:hover": {
            bgcolor: "action.hover",
            "& .handle-pill": {
              width: 56,
              bgcolor: "primary.light",
            },
          },
          userSelect: "none",
        }}
      >
        <FilterListIcon
          sx={{
            fontSize: 14,
            color: activeCount > 0 ? "primary.main" : "text.disabled",
            transition: "color 200ms",
          }}
        />
        <Box
          className="handle-pill"
          sx={{
            width: 48,
            height: 6,
            borderRadius: 3,
            bgcolor: activeCount > 0 ? "primary.light" : "grey.400",
            transition: "all 250ms",
          }}
        />
        <Typography
          variant="caption"
          sx={{
            color: activeCount > 0 ? "primary.main" : "text.secondary",
            fontWeight: 600,
            fontSize: "0.7rem",
            lineHeight: 1,
            whiteSpace: "nowrap",
          }}
        >
          {filterSummary}
        </Typography>
        <ExpandMoreIcon
          sx={{
            fontSize: 16,
            color: "text.disabled",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 250ms",
          }}
        />
      </Box>

      <Popper
        open={showGuide}
        anchorEl={barRef.current}
        placement="bottom"
        sx={{ zIndex: 1300 }}
      >
        <Paper
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            px: 2,
            py: 1.25,
            bgcolor: "primary.dark",
            color: "primary.contrastText",
            borderRadius: 2,
            boxShadow: 8,
            minWidth: 260,
            ml: 2,
            mt: 0.5,
          }}
        >
          <KeyboardArrowDownIcon sx={{ fontSize: 20, flexShrink: 0 }} />
          <Typography variant="body2" sx={{ flex: 1, lineHeight: 1.4 }}>
            点击此处展开全局筛选器，对仪表板数据进行筛选
          </Typography>
          <Button
            size="small"
            onClick={handleSkipGuide}
            sx={{
              flexShrink: 0,
              color: "inherit",
              borderColor: "rgba(255,255,255,0.4)",
              fontSize: "0.7rem",
              minWidth: 0,
              py: 0.125,
              px: 1,
              "&:hover": { borderColor: "rgba(255,255,255,0.8)" },
            }}
            variant="outlined"
          >
            知道了
          </Button>
        </Paper>
      </Popper>
      <Collapse in={open} timeout={250}>
        <Box
          sx={{
            borderTop: "1px solid",
            borderColor: "divider",
            bgcolor: "background.paper",
            boxShadow: 3,
            maxHeight: 320,
            overflow: "auto",
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 12,
          }}
        >
          <FilterPanel
            filters={filters}
            filterState={filterState}
            onFilterChange={onFilterChange}
            pendingFilterIds={pendingFilterIds}
          />
        </Box>
      </Collapse>
    </Box>
  );
}

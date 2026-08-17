import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import React from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import DeleteIcon from "@mui/icons-material/Delete";
import KeyboardArrowRight from "@mui/icons-material/KeyboardArrowRight";
import Pagination from "@mui/material/Pagination";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useToolbarStore } from "@/store/toolbarStore";
import { useMediaQuery, useTheme } from "@mui/material";
import type { DataGridProps } from "@mui/x-data-grid";
import DataGridTable from "./DataGridTable";

const SWIPE_THRESHOLD = 40;
const ACTION_WIDTH = 72;

interface ResponsiveDataGridProps<R = any> extends Omit<DataGridProps, "rows"> {
  rows: readonly R[];
  renderCard?: (row: R) => ReactNode;
  onEdit?: (row: R) => void;
  onDelete?: (row: R) => void;
  onBatchDelete?: (ids: string[]) => void;
  toolbarPageKey?: string;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

function SwipeableCard({
  row,
  children,
  onEdit,
  onDelete,
  isOpen,
  onOpenChange,
  isSelected,
  showCheckbox,
  onToggleSelect,
}: {
  row: Record<string, unknown>;
  children: ReactNode;
  onEdit?: (row: Record<string, unknown>) => void;
  onDelete?: (row: Record<string, unknown>) => void;
  isOpen: boolean;
  onOpenChange: (id: string | null) => void;
  isSelected: boolean;
  showCheckbox: boolean;
  onToggleSelect: (id: string) => void;
}) {
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const offsetRef = useRef(0);
  const slideRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout>>();
  const isSwiping = useRef(false);
  const justSwiped = useRef(false);
  const dxRef = useRef(0);

  useEffect(() => {
    if (!isOpen) snapTo(0);
  }, [isOpen]);

  const snapTo = (x: number, smooth = true) => {
    offsetRef.current = x;
    if (slideRef.current) {
      slideRef.current.style.transform = `translateX(${x}px)`;
      slideRef.current.style.transition = smooth
        ? "transform 200ms cubic-bezier(0.2, 0, 0, 1)"
        : "none";
    }
  };

  const closeSwipe = useCallback(() => {
    onOpenChange(null);
  }, [onOpenChange]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (isOpen) {
        closeSwipe();
        return;
      }
      if (slideRef.current) slideRef.current.style.transition = "none";
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      isSwiping.current = false;

      if (!showCheckbox) {
        longPressTimer.current = setTimeout(() => {
          if (!isSwiping.current) {
            navigator.vibrate?.(10);
            onToggleSelect(String(row.id ?? ""));
          }
        }, 600);
      }
    },
    [isOpen, closeSwipe, showCheckbox, onToggleSelect, row],
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 5) {
      isSwiping.current = true;
      clearTimeout(longPressTimer.current);
    }
    if (!isSwiping.current) return;
    dxRef.current = dx;
  }, []);

  const handleTouchEnd = useCallback(() => {
    clearTimeout(longPressTimer.current);
    if (!isSwiping.current) return;
    justSwiped.current = true;
    setTimeout(() => {
      justSwiped.current = false;
    }, 300);
    if (dxRef.current < -SWIPE_THRESHOLD) {
      onOpenChange(String(row.id ?? ""));
      snapTo(-ACTION_WIDTH);
    } else if (dxRef.current > SWIPE_THRESHOLD && onEdit) {
      navigator.vibrate?.(10);
      onEdit(row);
      closeSwipe();
    } else {
      closeSwipe();
    }
  }, [closeSwipe, onOpenChange, onEdit, row]);

  const handleDelete = useCallback(() => {
    closeSwipe();
    setTimeout(() => onDelete?.(row), 100);
  }, [closeSwipe, onDelete, row]);

  return (
    <Card
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={() => {
        if (justSwiped.current) return;
        if (isOpen) closeSwipe();
        else if (showCheckbox) onToggleSelect(String(row.id ?? ""));
      }}
      onPointerDown={() => {
        if (!isOpen && !showCheckbox) onOpenChange(null);
      }}
      sx={{
        borderRadius: 1.5,
        border: isSelected ? "2px solid" : 0,
        borderColor: isSelected ? "primary.main" : undefined,
        boxShadow: "var(--mui-palette-shadow-sm)",
        overflow: "hidden",
        userSelect: "none",
        touchAction: "pan-y",
        bgcolor: isSelected ? "action.hover" : "background.paper",
      }}
    >
      <Box
        ref={slideRef}
        sx={{
          display: "flex",
          transition: "transform 200ms cubic-bezier(0.2, 0, 0, 1)",
        }}
      >
        <Box
          sx={{
            display: "flex",
            width: "100%",
            flexShrink: 0,
            position: "relative",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "flex-start",
              flex: 1,
              minWidth: 0,
            }}
          >
            <Box
              sx={{
                flexShrink: 0,
                alignSelf: "center",
                visibility: showCheckbox ? "visible" : "hidden",
              }}
            >
              <Checkbox
                checked={isSelected}
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(String(row.id ?? ""));
                }}
                sx={{ p: "6px", "& .MuiSvgIcon-root": { fontSize: 20 } }}
              />
            </Box>
            <CardContent
              sx={{
                p: 1.5,
                pr: "36px",
                "&:last-child": { pb: 1.5 },
                flex: 1,
              }}
            >
              {children}
            </CardContent>
          </Box>
          <Box
            sx={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "primary.main",
              opacity: isOpen ? 0 : 1,
              transition: "opacity 0.2s ease",
            }}
          >
            <KeyboardArrowRight sx={{ fontSize: 20, color: "white" }} />
          </Box>
        </Box>
        <Box
          onClick={(e) => {
            e.stopPropagation();
            handleDelete();
          }}
          sx={{
            width: ACTION_WIDTH,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 0.25,
            bgcolor: "error.main",
            cursor: "pointer",
          }}
        >
          <DeleteIcon sx={{ fontSize: 22, color: "white" }} />
          <Typography
            variant="caption"
            sx={{
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "white",
              lineHeight: 1,
            }}
          >
            删除
          </Typography>
        </Box>
      </Box>
    </Card>
  );
}

export default function ResponsiveDataGrid<R = any>({
  renderCard,
  onEdit,
  onDelete,
  onBatchDelete,
  toolbarPageKey,
  selectedIds: selectedIdsProp,
  onSelectionChange,
  ...gridProps
}: ResponsiveDataGridProps<R>) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(selectedIdsProp ?? []),
  );
  const [jumpPage, setJumpPage] = useState("");
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const registerTools = useToolbarStore((s) => s.registerTools);

  useEffect(() => {
    if (selectedIdsProp) setSelectedIds(new Set(selectedIdsProp));
  }, [selectedIdsProp]);

  const selectedCount = selectedIds.size;

  useEffect(() => {
    if (!toolbarPageKey || !onBatchDelete) return;
    if (selectedCount > 0) {
      registerTools(toolbarPageKey, [
        {
          id: "batch_delete",
          priority: 12,
          showOnMobile: true,
          primary: true,
          fabIcon: <DeleteIcon />,
          fabLabel: `Delete ${selectedCount}`,
          fabColor: "error",
          action: () => {
            onBatchDelete(Array.from(selectedIdsRef.current));
            setSelectedIds(new Set());
          },
          render: null,
        },
      ]);
    } else {
      const existing =
        useToolbarStore.getState().registry[toolbarPageKey] || [];
      registerTools(
        toolbarPageKey,
        existing.filter((t) => t.id !== "batch_delete"),
      );
    }
  }, [selectedCount, toolbarPageKey, onBatchDelete, registerTools]);

  const handleOpenChange = useCallback((id: string | null) => {
    setOpenCardId((prev) => (prev === id ? null : id));
  }, []);

  const handleToggleSelect = useCallback(
    (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onSelectionChange?.(Array.from(next));
        return next;
      });
    },
    [onSelectionChange],
  );

  if (!isMobile || !renderCard) {
    return (
      <Box sx={{ flex: 1, minHeight: 0, position: "relative" }}>
        <DataGridTable {...gridProps} />
      </Box>
    );
  }

  const rows = gridProps.rows as R[];
  const paginationModel = gridProps.paginationModel;
  const rowCount = gridProps.rowCount ?? rows.length;
  const pageSize = paginationModel?.pageSize ?? 25;
  const page = paginationModel?.page ?? 0;
  const totalPages = Math.ceil(rowCount / pageSize);

  const handlePageChange = (_: React.ChangeEvent<unknown>, p: number) => {
    gridProps.onPaginationModelChange?.({ page: p - 1, pageSize }, {} as any);
  };

  return (
    <Box sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, pb: 2 }}>
        {rows.map((row, i) => {
          const recordRow = row as Record<string, unknown>;
          const cardId = String(recordRow.id ?? i);
          return (
            <SwipeableCard
              key={cardId}
              row={recordRow}
              onEdit={
                onEdit as ((row: Record<string, unknown>) => void) | undefined
              }
              onDelete={
                onDelete as ((row: Record<string, unknown>) => void) | undefined
              }
              isOpen={openCardId === cardId}
              onOpenChange={handleOpenChange}
              isSelected={selectedIds.has(cardId)}
              showCheckbox={selectedCount > 0}
              onToggleSelect={handleToggleSelect}
            >
              {renderCard(row)}
            </SwipeableCard>
          );
        })}
        {totalPages > 1 && (
          <Box
            sx={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 1.5,
              py: 2,
              pr: { xs: 7, sm: 0 },
            }}
          >
            <Pagination
              count={totalPages}
              page={page + 1}
              onChange={handlePageChange}
              color="primary"
              shape="rounded"
              size="small"
            />
            <TextField
              size="small"
              type="number"
              value={jumpPage}
              onChange={(e) => setJumpPage(e.target.value)}
              placeholder={`跳转到 1-${totalPages}`}
              slotProps={{ htmlInput: { min: 1, max: totalPages } }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const n = Number(jumpPage);
                  if (n >= 1 && n <= totalPages) {
                    gridProps.onPaginationModelChange?.({ page: n - 1, pageSize }, {} as never);
                    setJumpPage("");
                  }
                }
              }}
              sx={{ width: 110, "& .MuiInputBase-input": { py: 0.9 } }}
            />
          </Box>
        )}
      </Box>
    </Box>
  );
}

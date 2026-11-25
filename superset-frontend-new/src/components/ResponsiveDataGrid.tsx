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
import IconButton from "@mui/material/IconButton";
import KeyboardArrowRight from "@mui/icons-material/KeyboardArrowRight";
import Pagination from "@mui/material/Pagination";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useToolbarStore } from "@/store/toolbarStore";
import { useMediaQuery, useTheme } from "@mui/material";
import type { DataGridProps, GridCallbackDetails } from "@mui/x-data-grid";
import DataGridTable from "./DataGridTable";

const SWIPE_THRESHOLD = 40;
const ACTION_WIDTH = 72;

interface ResponsiveDataGridProps<
  R extends { id?: string | number } = Record<string, unknown>,
> extends Omit<DataGridProps, "rows"> {
  rows: readonly R[];
  renderCard?: (row: R) => ReactNode;
  onEdit?: (row: R) => void;
  onDelete?: (row: R) => void;
  onBatchDelete?: (ids: string[]) => void;
  toolbarPageKey?: string;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
}

function SwipeableCard<R extends { id?: string | number }>({
  row,
  rowLabel,
  children,
  onEdit,
  onDelete,
  isOpen,
  onOpenChange,
  isSelected,
  showCheckbox,
  onToggleSelect,
}: {
  row: R;
  rowLabel: string;
  children: ReactNode;
  onEdit?: (row: R) => void;
  onDelete?: (row: R) => void;
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
      role="button"
      tabIndex={0}
      aria-label={rowLabel}
      aria-pressed={isSelected}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={() => {
        if (justSwiped.current) return;
        if (isOpen) closeSwipe();
        else if (showCheckbox) onToggleSelect(String(row.id ?? ""));
        else if (onDelete) onOpenChange(String(row.id ?? ""));
      }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (isOpen) closeSwipe();
          else if (showCheckbox) onToggleSelect(String(row.id ?? ""));
          else if (onDelete) onOpenChange(String(row.id ?? ""));
        }
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
                tabIndex={showCheckbox ? 0 : -1}
                aria-hidden={!showCheckbox}
                aria-label={`选择${rowLabel}`}
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
              bgcolor: onDelete ? "error.main" : "primary.main",
              opacity: isOpen ? 0 : 1,
              transition: "opacity 0.2s ease",
            }}
          >
            {onDelete ? (
              <Tooltip title={`删除${rowLabel}`}>
                <IconButton
                  size="small"
                  aria-label={`删除${rowLabel}`}
                  aria-hidden={isOpen}
                  tabIndex={isOpen ? -1 : 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete();
                  }}
                  sx={{ color: "white" }}
                >
                  <DeleteIcon sx={{ fontSize: 20 }} />
                </IconButton>
              </Tooltip>
            ) : (
              <KeyboardArrowRight sx={{ fontSize: 20, color: "white" }} />
            )}
          </Box>
        </Box>
        {onDelete && (
          <Box
            component="button"
            type="button"
            aria-label={`删除${rowLabel}`}
            aria-hidden={!isOpen}
            tabIndex={isOpen ? 0 : -1}
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
              border: 0,
              bgcolor: "error.main",
              color: "white",
              cursor: "pointer",
              font: "inherit",
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
        )}
      </Box>
    </Card>
  );
}

export default function ResponsiveDataGrid<
  R extends { id?: string | number } = Record<string, unknown>,
>({
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
          fabLabel: `删除 ${selectedCount} 项`,
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

  const rows = gridProps.rows;
  const paginationModel = gridProps.paginationModel;
  const rowCount = gridProps.rowCount ?? rows.length;
  const pageSize = paginationModel?.pageSize ?? 25;
  const page = paginationModel?.page ?? 0;
  const totalPages = Math.ceil(rowCount / pageSize);

  const changePage = (p: number) => {
    const model = { page: p - 1, pageSize };
    const details = {
      reason: "setPaginationModel",
      api: gridProps.apiRef?.current,
    } as GridCallbackDetails<"pagination">;
    gridProps.onPaginationModelChange?.(model, details);
    setJumpPage("");
  };

  const handlePageChange = (_: React.ChangeEvent<unknown>, p: number) => {
    changePage(p);
  };

  return (
    <Box sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, pb: 2 }}>
        {rows.map((row, i) => {
          const cardId = String(row.id ?? i);
          return (
            <SwipeableCard
              key={cardId}
              row={row}
              rowLabel={`第 ${i + 1} 项`}
              onEdit={onEdit}
              onDelete={onDelete}
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
                    changePage(n);
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

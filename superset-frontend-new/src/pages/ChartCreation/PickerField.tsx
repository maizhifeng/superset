import { useState, useRef, useCallback, useMemo } from "react";
import Box from "@mui/material/Box";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";

import Popover from "@mui/material/Popover";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";

export interface PickerOption {
  value: string;
  label: string;
  group?: string;
}

interface PickerFieldProps {
  label: string;
  options: PickerOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  loading?: boolean;
  placeholder?: string;
  singleSelect?: boolean;
  hideGroups?: boolean;
  hideHeader?: boolean;
  compact?: boolean;
  /** Extra-dense trigger row (used inside the pivot layout side panel). */
  dense?: boolean;
}

function DragHandle(props: { isDragging?: boolean }) {
  return (
    <Box
      sx={{
        display: "flex",
        cursor: props.isDragging ? "grabbing" : "grab",
        color: "grey.400",
        flexShrink: 0,
        "&:hover": { color: "text.primary" },
      }}
    >
      <DragIndicatorIcon sx={{ fontSize: 20 }} />
    </Box>
  );
}

function OptionRow({
  opt,
  isSelected,
  dragHandle,
  after,
  compact,
}: {
  opt: PickerOption;
  isSelected: boolean;
  dragHandle?: React.ReactNode;
  after?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        px: 2,
        py: compact ? 0.5 : 1.25,
        borderBottom: "1px solid",
        borderColor: "divider",
        textAlign: "left",
        bgcolor: isSelected ? "action.selected" : "transparent",
        color: "inherit",
        minHeight: compact ? 32 : 44,
        "&:last-of-type": { borderBottom: "none" },
      }}
    >
      {dragHandle || <Box sx={{ width: 20, flexShrink: 0 }} />}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant={compact ? "caption" : "body2"}
          sx={{
            fontWeight: isSelected ? 600 : 400,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {opt.label}
        </Typography>
        {opt.group && (
          <Typography
            variant="caption"
            sx={{
              color: "text.disabled",
              display: "block",
              fontSize: "0.75rem",
            }}
          >
            {opt.group}
          </Typography>
        )}
      </Box>
      {after}
    </Box>
  );
}

function SortableSelectedItem({
  opt,
  onRemove,
  compact,
}: {
  opt: PickerOption;
  onRemove: () => void;
  compact?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: opt.value });

  const style = {
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    transition,
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      onClick={onRemove}
      sx={{
        opacity: isDragging ? 0.3 : 1,
        cursor: "pointer",
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      <OptionRow
        opt={opt}
        isSelected
        compact={compact}
        dragHandle={
          <Box
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            sx={{
              display: "flex",
              cursor: "grab",
              color: "grey.400",
              flexShrink: 0,
              "&:hover": { color: "text.primary" },
            }}
          >
            <DragIndicatorIcon sx={{ fontSize: 20 }} />
          </Box>
        }
        after={
          <Box
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 24,
              height: 24,
              borderRadius: 1,
              color: "error.main",
              flexShrink: 0,
              cursor: "pointer",
              "&:hover": { bgcolor: "error.softBg" },
            }}
          >
            <RemoveCircleIcon sx={{ fontSize: 18 }} />
          </Box>
        }
      />
    </Box>
  );
}

function AvailableOption({
  opt,
  onSelect,
  compact,
}: {
  opt: PickerOption;
  onSelect: () => void;
  compact?: boolean;
}) {
  return (
    <Box
      onClick={onSelect}
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        px: 2,
        py: compact ? 0.5 : 1.25,
        borderBottom: "1px solid",
        borderColor: "divider",
        cursor: "pointer",
        textAlign: "left",
        bgcolor: "transparent",
        color: "inherit",
        minHeight: compact ? 32 : 44,
        "&:hover": { bgcolor: "action.hover" },
        "&:last-of-type": { borderBottom: "none" },
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant={compact ? "caption" : "body2"}
          sx={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {opt.label}
        </Typography>
        {opt.group && (
          <Typography
            variant="caption"
            sx={{
              color: "text.disabled",
              display: "block",
              fontSize: "0.75rem",
            }}
          >
            {opt.group}
          </Typography>
        )}
      </Box>
      <AddCircleIcon
        sx={{
          fontSize: compact ? 16 : 20,
          flexShrink: 0,
          color: "success.main",
        }}
      />
    </Box>
  );
}

export default function PickerField({
  label,
  options,
  selected,
  onChange,
  loading,
  placeholder = "选择...",
  singleSelect,
  hideGroups: _hideGroups,
  hideHeader,
  compact,
  dense,
}: PickerFieldProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftSelected, setDraftSelected] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const currentSelected = anchorEl ? draftSelected : selected;

  const selectedOptions = useMemo(
    () =>
      currentSelected
        .map((v) => options.find((o) => o.value === v))
        .filter((o): o is PickerOption => o != null),
    [currentSelected, options],
  );

  const unselectedOptions = searchQuery
    ? options.filter(
        (opt) =>
          !currentSelected.includes(opt.value) &&
          opt.label.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : options.filter((opt) => !currentSelected.includes(opt.value));

  const handleOpen = (e: React.MouseEvent<HTMLElement>) => {
    if (loading) return;
    setDraftSelected(selected);
    setAnchorEl(e.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setSearchQuery("");
  };

  const handleConfirm = () => {
    onChange(draftSelected);
    setAnchorEl(null);
    setSearchQuery("");
  };

  const toggleOption = (value: string) => {
    if (singleSelect) {
      onChange([value]);
      setAnchorEl(null);
    } else if (currentSelected.includes(value)) {
      setDraftSelected(currentSelected.filter((v) => v !== value));
    } else {
      setDraftSelected([...currentSelected, value]);
    }
  };

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const list = anchorEl ? draftSelected : selected;
      const oldIndex = list.indexOf(String(active.id));
      const newIndex = list.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;
      const reordered = arrayMove(list, oldIndex, newIndex);
      if (anchorEl) setDraftSelected(reordered);
      else onChange(reordered);
    },
    [anchorEl, draftSelected, selected, onChange],
  );

  const activeOption = activeId
    ? options.find((o) => o.value === activeId)
    : null;

  return (
    <>
      <Box
        ref={containerRef}
        onClick={handleOpen}
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "nowrap",
          gap: 0.75,
          p: dense ? 0.75 : 1.5,
          borderRadius: 1.5,
          border: "1px solid",
          borderColor: anchorEl ? "primary.main" : "divider",
          bgcolor: "background.paper",
          cursor: loading ? "default" : "pointer",
          minHeight: dense ? 32 : 48,
          overflow: "auto",
          transition: "border-color 150ms ease, box-shadow 150ms ease",
          "&:hover": {
            borderColor: "primary.light",
            boxShadow: "var(--mui-palette-shadow-focus)",
          },
        }}
      >
        {loading ? (
          <CircularProgress size={16} sx={{ mx: "auto" }} />
        ) : selected.length === 0 ? (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              color: "text.disabled",
              width: "100%",
            }}
          >
            <AddIcon sx={{ fontSize: 16 }} />
            <Typography variant="body2">{placeholder}</Typography>
          </Box>
        ) : (
          selected.map((v) => {
            const opt = options.find((o) => o.value === v);
            return (
              <Chip
                key={v}
                label={opt?.label || v}
                size="small"
                onDelete={() => onChange(selected.filter((s) => s !== v))}
                onMouseDown={(e) => e.stopPropagation()}
                sx={{ flexShrink: 0, maxWidth: 160, minHeight: 28 }}
              />
            );
          })
        )}
      </Box>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={isMobile ? undefined : anchorEl}
        anchorReference={isMobile ? "none" : "anchorEl"}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: isMobile
              ? {
                  position: "fixed",
                  top: 0,
                  left: 0,
                  width: "100vw",
                  height: "100dvh",
                  maxWidth: "100vw",
                  maxHeight: "100dvh",
                  borderRadius: 0,
                  border: "1px solid",
                  borderColor: "primary.light",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }
              : {
                  mt: 1,
                  width: 520,
                  maxHeight: 520,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: "primary.light",
                  boxShadow: "var(--mui-palette-shadow-modal)",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                },
          },
        }}
      >
        {!hideHeader && (
          <Box
            sx={{
              px: 2,
              py: 1,
              borderBottom: "1px solid",
              borderColor: "divider",
              bgcolor: "grey.50",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {label}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {singleSelect ? "" : `${selected.length} 已选择`}
            </Typography>
          </Box>
        )}

        <Box sx={{ px: 2, py: 1 }}>
          <TextField
            placeholder={`搜索 ${label.toLowerCase()}...`}
            size="small"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon sx={{ fontSize: 18, color: "text.disabled" }} />
                  </InputAdornment>
                ),
                endAdornment: searchQuery ? (
                  <InputAdornment
                    position="end"
                    onClick={() => setSearchQuery("")}
                    sx={{
                      cursor: "pointer",
                      color: "text.disabled",
                      "&:hover": { color: "text.primary" },
                    }}
                  >
                    <CloseIcon sx={{ fontSize: 16 }} />
                  </InputAdornment>
                ) : undefined,
              },
            }}
            sx={{
              width: "100%",
              "& .MuiOutlinedInput-root": {
                borderRadius: 2,
                fontSize: "0.8125rem",
              },
            }}
          />
        </Box>

        <Box sx={{ display: "flex", flex: 1, minHeight: 0 }}>
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              borderRight: "1px solid",
              borderColor: "divider",
              minWidth: 0,
            }}
          >
            <Box
              sx={{
                px: 2,
                py: 0.75,
                borderBottom: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  color: "text.secondary",
                  letterSpacing: "0.04em",
                  fontSize: "0.7rem",
                }}
              >
                {searchQuery ? "搜索结果" : "可用"}
              </Typography>
            </Box>
            <Box sx={{ overflowY: "auto", flex: 1 }}>
              {unselectedOptions.length === 0 ? (
                <Box
                  sx={{
                    px: 2,
                    py: 3,
                    textAlign: "center",
                    color: "text.secondary",
                  }}
                >
                  <Typography variant="body2">无可用选项</Typography>
                </Box>
              ) : (
                unselectedOptions.map((opt) => (
                  <AvailableOption
                    key={opt.value}
                    opt={opt}
                    compact={compact}
                    onSelect={() => toggleOption(opt.value)}
                  />
                ))
              )}
            </Box>
          </Box>

          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              bgcolor: selectedOptions.length > 0 ? undefined : "grey.25",
            }}
          >
            <Box
              sx={{
                px: 2,
                py: 0.75,
                borderBottom: "1px solid",
                borderColor: "divider",
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 700,
                  color: "text.secondary",
                  letterSpacing: "0.04em",
                  fontSize: "0.7rem",
                }}
              >
                已选择 ({selectedOptions.length})
              </Typography>
            </Box>
            <Box sx={{ overflowY: "auto", flex: 1 }}>
              {selectedOptions.length === 0 ? (
                <Box
                  sx={{
                    px: 2,
                    py: 3,
                    textAlign: "center",
                    color: "text.disabled",
                  }}
                >
                  <Typography variant="body2">暂无选择</Typography>
                </Box>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={selected}
                    strategy={verticalListSortingStrategy}
                  >
                    {selectedOptions.map((opt) => (
                      <SortableSelectedItem
                        key={opt.value}
                        opt={opt}
                        compact={compact}
                        onRemove={() => toggleOption(opt.value)}
                      />
                    ))}
                  </SortableContext>

                  <DragOverlay dropAnimation={null}>
                    {activeOption ? (
                      <Box
                        sx={{
                          bgcolor: "background.paper",
                          borderRadius: 1,
                          boxShadow: "var(--mui-palette-shadow-modal)",
                          border: "1px solid",
                          borderColor: "primary.light",
                          width: (containerRef.current?.offsetWidth || 320) / 2,
                        }}
                      >
                        <OptionRow
                          opt={activeOption}
                          isSelected
                          dragHandle={<DragHandle isDragging />}
                        />
                      </Box>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              )}
            </Box>
          </Box>
        </Box>

        <Box
          sx={{
            px: 2,
            py: 1,
            borderTop: "1px solid",
            borderColor: "divider",
            display: "flex",
            justifyContent: "flex-end",
            bgcolor: "grey.50",
          }}
        >
          <Chip
            label="完成"
            size="small"
            onClick={handleConfirm}
            variant="outlined"
            color="primary"
            sx={{ fontWeight: 500 }}
          />
        </Box>
      </Popover>
    </>
  );
}

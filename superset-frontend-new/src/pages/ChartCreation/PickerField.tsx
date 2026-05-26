import { useState, useRef, useCallback, useMemo } from "react";
import Box from "@mui/material/Box";


import Popover from "@mui/material/Popover";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import CloseIcon from "@mui/icons-material/Close";
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
  compact,
}: {
  opt: PickerOption;
  isSelected: boolean;
  dragHandle?: React.ReactNode;
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
        bgcolor: isSelected ? "rgba(32, 167, 201, 0.08)" : "transparent",
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
            sx={{ color: "text.disabled", display: "block", fontSize: "0.75rem" }}
          >
            {opt.group}
          </Typography>
        )}
      </Box>
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: opt.value });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
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
        "&:hover": { bgcolor: "rgba(32, 167, 201, 0.12)" },
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
      <Box
        sx={{
          width: compact ? 16 : 20,
          height: compact ? 16 : 20,
          borderRadius: 0.5,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "2px solid",
          borderColor: "grey.400",
        }}
      />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant={compact ? "caption" : "body2"}
          sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {opt.label}
        </Typography>
        {opt.group && (
          <Typography
            variant="caption"
            sx={{ color: "text.disabled", display: "block", fontSize: "0.75rem" }}
          >
            {opt.group}
          </Typography>
        )}
      </Box>
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
  hideGroups,
  hideHeader,
  compact,
}: PickerFieldProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const selectedOptions = useMemo(
    () =>
      selected
        .map((v) => options.find((o) => o.value === v))
        .filter((o): o is PickerOption => o != null),
    [selected, options],
  );

  const unselectedOptions = searchQuery
    ? options.filter(
        (opt) =>
          !selected.includes(opt.value) &&
          opt.label.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : options.filter((opt) => !selected.includes(opt.value));

  const toggleOption = (value: string) => {
    if (singleSelect) {
      onChange([value]);
      setAnchorEl(null);
    } else if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
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
      const oldIndex = selected.indexOf(String(active.id));
      const newIndex = selected.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;
      onChange(arrayMove(selected, oldIndex, newIndex));
    },
    [selected, onChange],
  );

  const activeOption = activeId ? options.find((o) => o.value === activeId) : null;

  return (
    <>
      <Box
        ref={containerRef}
        onClick={(e) => !loading && setAnchorEl(e.currentTarget)}
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "nowrap",
          gap: 0.75,
          p: 1.5,
          borderRadius: 1.5,
          border: "1px solid",
          borderColor: anchorEl ? "primary.main" : "divider",
          bgcolor: "background.paper",
          cursor: loading ? "default" : "pointer",
          minHeight: 48,
          overflow: "auto",
          transition: "border-color 150ms ease, box-shadow 150ms ease",
          "&:hover": {
            borderColor: "primary.light",
            boxShadow: "0 0 0 2px rgba(32, 167, 201, 0.1)",
          },
        }}
      >
        {loading ? (
          <CircularProgress size={16} sx={{ mx: "auto" }} />
        ) : selected.length === 0 ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, color: "text.disabled", width: "100%" }}>
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
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              width: containerRef.current?.offsetWidth || 320,
              maxHeight: 360,
              borderRadius: 2,
              border: "1px solid",
              borderColor: "primary.light",
              boxShadow:
                "0 4px 8px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.12)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            },
          },
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
          {!hideHeader && (
            <Box sx={{ px: 2, py: 1, borderBottom: "1px solid", borderColor: "divider", bgcolor: "grey.50", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
                      sx={{ cursor: "pointer", color: "text.disabled", "&:hover": { color: "text.primary" } }}
                    >
                      <CloseIcon sx={{ fontSize: 16 }} />
                    </InputAdornment>
                  ) : undefined,
                },
              }}
              sx={{
                width: "100%",
                "& .MuiOutlinedInput-root": { borderRadius: 2, fontSize: "0.8125rem" },
              }}
            />
          </Box>

          <Box sx={{ overflowY: "auto", minHeight: 0, flex: 1 }}>
            {selectedOptions.length > 0 && (
              <Box>
                <Box
                  sx={{
                    position: "sticky",
                    top: 0,
                    zIndex: 100,
                    px: 2,
                    py: 0.75,
                    bgcolor: "background.paper",
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
                <Box>
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
                            boxShadow:
                              "0 8px 24px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.08)",
                            border: "1px solid",
                            borderColor: "primary.light",
                            width: containerRef.current?.offsetWidth || 320,
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
                </Box>
              </Box>
            )}

            <Box>
              <Box
                sx={{
                  position: "sticky",
                  top: 0,
                  zIndex: 100,
                  px: 2,
                  py: 0.75,
                  bgcolor: "background.paper",
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
              {unselectedOptions.length === 0 ? (
                <Box sx={{ px: 2, py: 3, textAlign: "center", color: "text.secondary" }}>
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

          <Box sx={{ px: 2, py: 1, borderTop: "1px solid", borderColor: "divider", display: "flex", justifyContent: "flex-end", bgcolor: "grey.50" }}>
            <Chip
              label="完成"
              size="small"
              onClick={() => setAnchorEl(null)}
              variant="outlined"
              color="primary"
              sx={{ fontWeight: 500 }}
            />
          </Box>
        </Box>
      </Popover>
    </>
  );
}

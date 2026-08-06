import { useCallback, useMemo, useState, type ElementType } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import CloseIcon from "@mui/icons-material/Close";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import TagIcon from "@mui/icons-material/Tag";
import FunctionsIcon from "@mui/icons-material/Functions";
import CategoryIcon from "@mui/icons-material/Category";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import ViewAgendaIcon from "@mui/icons-material/ViewAgenda";
import {
  DndContext,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
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

interface FieldOption {
  value: string;
  label: string;
}

interface PivotLayoutBuilderProps {
  dimensionOptions: FieldOption[];
  metricOptions: FieldOption[];
  rowDims: string[];
  colDims: string[];
  metrics: string[];
  loading?: boolean;
  onRowDimsChange: (v: string[]) => void;
  onColDimsChange: (v: string[]) => void;
  onMetricsChange: (v: string[]) => void;
}

type Zone = "pool" | "rows" | "cols" | "values";
type Kind = "dim" | "metric";

const SEP = "\u0000";

const KIND_STYLE: Record<
  Kind,
  {
    main: string;
    container: string;
    onContainer: string;
    soft: string;
  }
> = {
  dim: {
    main: "primary.main",
    container: "primary.container",
    onContainer: "primary.onContainer",
    soft: "rgba(184, 101, 58, 0.06)",
  },
  metric: {
    main: "success.main",
    container: "success.container",
    onContainer: "success.onContainer",
    soft: "rgba(90, 143, 106, 0.06)",
  },
};

const KIND_ICONS: Record<Kind, ElementType> = {
  dim: TagIcon,
  metric: FunctionsIcon,
};

const ZONE_ICONS: Record<Exclude<Zone, "pool">, ElementType> = {
  rows: ViewAgendaIcon,
  cols: ViewColumnIcon,
  values: FunctionsIcon,
};

function itemId(zone: Zone, value: string): string {
  return `${zone}${SEP}${value}`;
}

function parseZone(id: string): Zone {
  const zone = id.split(SEP)[0];
  return (["pool", "rows", "cols", "values"] as const).includes(zone as Zone)
    ? (zone as Zone)
    : "pool";
}

function parseValue(id: string): string {
  return id.split(SEP)[1] ?? "";
}

function ZoneFrame({
  title,
  icon,
  kind,
  count,
  children,
}: {
  title: string;
  icon?: ElementType;
  kind?: Kind;
  count?: number;
  children: React.ReactNode;
}) {
  const k = kind ? KIND_STYLE[kind] : null;
  const Icon = icon;
  const hasCount = count !== undefined;
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1.5,
        overflow: "hidden",
        minWidth: 0,
        minHeight: 0,
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.75,
          px: 1,
          py: 0.4,
          borderBottom: "1px solid",
          borderColor: "divider",
          bgcolor: "grey.50",
          flexShrink: 0,
        }}
      >
        {Icon && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 18,
              height: 18,
              borderRadius: "50%",
              bgcolor: k ? k.container : "action.hover",
              color: k ? k.main : "text.disabled",
              flexShrink: 0,
            }}
          >
            <Icon sx={{ fontSize: 13 }} />
          </Box>
        )}
        <Typography
          variant="caption"
          sx={{
            fontWeight: 700,
            fontSize: "0.68rem",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: k ? k.onContainer : "inherit",
          }}
        >
          {title}
        </Typography>
        {hasCount && k && (
          <>
            <Box sx={{ flex: 1 }} />
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 18,
                height: 18,
                px: 0.5,
                borderRadius: 999,
                bgcolor: count > 0 ? k.container : "action.hover",
                color: count > 0 ? k.main : "text.disabled",
                fontSize: "0.62rem",
                fontWeight: 700,
                transition: "background-color 140ms ease, color 140ms ease",
              }}
            >
              {count}
            </Box>
          </>
        )}
      </Box>
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          p: 0.5,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

function PoolItem({
  value,
  label,
  kind,
}: {
  value: string;
  label: string;
  kind: Kind;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: itemId("pool", value),
    data: { kind, from: "pool" },
  });
  const k = KIND_STYLE[kind];
  return (
    <Box
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        px: 0.75,
        py: 0.35,
        borderRadius: 1,
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        opacity: isDragging ? 0.35 : 1,
        transition:
          "opacity 120ms ease, background-color 120ms ease, color 120ms ease",
        "&:hover": isDragging
          ? undefined
          : { bgcolor: "action.hover", color: "primary.main" },
      }}
    >
      <DragIndicatorIcon
        sx={{
          fontSize: 14,
          color: isDragging ? "text.disabled" : "grey.300",
          flexShrink: 0,
        }}
      />
      <Box
        sx={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          bgcolor: k.main,
          opacity: isDragging ? 0.4 : 0.4,
          flexShrink: 0,
        }}
      />
      <Typography
        variant="caption"
        sx={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: "0.72rem",
          lineHeight: 1.35,
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

function ZoneItem({
  zone,
  value,
  label,
  kind,
  onRemove,
}: {
  zone: Exclude<Zone, "pool">;
  value: string;
  label: string;
  kind: Kind;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: itemId(zone, value),
    data: { kind, from: zone },
  });
  const k = KIND_STYLE[kind];
  const Icon = KIND_ICONS[kind];
  return (
    <Box
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition: `${transition}, opacity 120ms ease`,
      }}
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        pl: 0.5,
        pr: 0.25,
        py: 0.15,
        minHeight: 26,
        bgcolor: k.container,
        color: k.onContainer,
        borderRadius: 1.25,
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        opacity: isDragging ? 0.35 : 1,
        border: "1px solid",
        borderColor: "transparent",
        "&:hover": isDragging
          ? undefined
          : { borderColor: k.main, "& .pivot-remove": { opacity: 1 } },
      }}
    >
      <DragIndicatorIcon
        sx={{
          fontSize: 13,
          color: k.onContainer,
          opacity: 0.35,
          flexShrink: 0,
        }}
      />
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 16,
          height: 16,
          borderRadius: "50%",
          bgcolor: "rgba(255,255,255,0.6)",
          color: k.main,
          flexShrink: 0,
        }}
      >
        <Icon sx={{ fontSize: 11 }} />
      </Box>
      <Typography
        variant="caption"
        sx={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: "0.72rem",
          fontWeight: 600,
          lineHeight: 1.35,
        }}
      >
        {label}
      </Typography>
      <Box
        className="pivot-remove"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 18,
          height: 18,
          borderRadius: "50%",
          cursor: "pointer",
          flexShrink: 0,
          color: k.onContainer,
          opacity: 0,
          transition:
            "opacity 120ms ease, background-color 120ms ease, color 120ms ease",
          "&:hover": { bgcolor: "error.main", color: "#ffffff" },
        }}
      >
        <CloseIcon sx={{ fontSize: 13 }} />
      </Box>
    </Box>
  );
}

function ZoneDropArea({
  zone,
  items,
  labelMap,
  kind,
  activeKind,
  onRemove,
  emptyHint,
}: {
  zone: Exclude<Zone, "pool">;
  items: string[];
  labelMap: Map<string, string>;
  kind: Kind;
  activeKind: Kind | null;
  onRemove: (value: string) => void;
  emptyHint: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: zone });
  const k = KIND_STYLE[kind];
  const Icon = ZONE_ICONS[zone];
  const matched = activeKind === kind;
  return (
    <Box
      ref={setNodeRef}
      sx={{
        flex: 1,
        minHeight: 56,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 0.4,
        p: 0.5,
        borderRadius: 1.25,
        border: "1.5px dashed",
        borderColor: isOver ? k.main : "divider",
        bgcolor: isOver ? k.container : matched ? k.soft : "transparent",
        boxShadow: isOver ? "var(--mui-palette-shadow-focus)" : undefined,
        transition:
          "border-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease",
      }}
    >
      {items.length === 0 ? (
        <Box
          sx={{
            m: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 0.5,
            py: 1,
            color: isOver ? k.main : "text.disabled",
            transition: "color 140ms ease",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              borderRadius: "50%",
              bgcolor: isOver ? "background.paper" : "action.hover",
              color: isOver ? k.main : "text.disabled",
              transition: "background-color 140ms ease, color 140ms ease",
              "@keyframes dropPulse": {
                "0%, 100%": { transform: "scale(1)" },
                "50%": { transform: "scale(1.12)" },
              },
              animation: isOver
                ? "dropPulse 900ms ease-in-out infinite"
                : undefined,
            }}
          >
            <Icon sx={{ fontSize: 14 }} />
          </Box>
          <Typography
            variant="caption"
            sx={{
              fontSize: "0.66rem",
              fontWeight: isOver ? 700 : 500,
              letterSpacing: "0.02em",
              textAlign: "center",
            }}
          >
            {isOver ? "松开以添加" : emptyHint}
          </Typography>
        </Box>
      ) : (
        <SortableContext
          items={items.map((v) => itemId(zone, v))}
          strategy={verticalListSortingStrategy}
        >
          {items.map((v) => (
            <ZoneItem
              key={v}
              zone={zone}
              value={v}
              label={labelMap.get(v) ?? v}
              kind={kind}
              onRemove={() => onRemove(v)}
            />
          ))}
        </SortableContext>
      )}
    </Box>
  );
}

function PoolDropArea({
  dims,
  metrics,
}: {
  dims: FieldOption[];
  metrics: FieldOption[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "pool" });
  return (
    <Box
      ref={setNodeRef}
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        borderRadius: 1,
        outline: isOver ? "2px solid" : "none",
        outlineColor: "primary.main",
        bgcolor: isOver ? "action.hover" : "transparent",
        boxShadow: isOver ? "var(--mui-palette-shadow-focus)" : undefined,
        transition:
          "outline-color 140ms ease, background-color 140ms ease, box-shadow 140ms ease",
      }}
    >
      {dims.length > 0 && (
        <>
          <GroupHeader kind="dim" label="维度" />
          <Box
            sx={{
              overflowY: "auto",
              maxHeight: 148,
              flexShrink: 0,
              p: 0.5,
              display: "flex",
              flexDirection: "column",
              gap: 0.25,
              borderBottom: "1px solid",
              borderColor: "divider",
            }}
          >
            {dims.map((o) => (
              <PoolItem
                key={o.value}
                value={o.value}
                label={o.label}
                kind="dim"
              />
            ))}
          </Box>
        </>
      )}
      {metrics.length > 0 && (
        <>
          <GroupHeader kind="metric" label="指标" />
          <Box
            sx={{
              overflowY: "auto",
              flex: 1,
              minHeight: 0,
              p: 0.5,
              display: "flex",
              flexDirection: "column",
              gap: 0.25,
            }}
          >
            {metrics.map((o) => (
              <PoolItem
                key={o.value}
                value={o.value}
                label={o.label}
                kind="metric"
              />
            ))}
          </Box>
        </>
      )}
      {dims.length === 0 && metrics.length === 0 && (
        <Typography variant="caption" sx={{ color: "text.disabled", p: 1 }}>
          暂无字段
        </Typography>
      )}
    </Box>
  );
}

function GroupHeader({ kind, label }: { kind: Kind; label: string }) {
  const k = KIND_STYLE[kind];
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        px: 1,
        py: 0.35,
        bgcolor: "action.hover",
        borderBottom: "1px solid",
        borderColor: "divider",
        flexShrink: 0,
      }}
    >
      <Box
        sx={{
          width: 4,
          height: 4,
          borderRadius: "50%",
          bgcolor: k.main,
          flexShrink: 0,
        }}
      />
      <Typography
        variant="caption"
        sx={{
          fontSize: "0.64rem",
          fontWeight: 700,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          color: "text.secondary",
        }}
      >
        {label}
      </Typography>
    </Box>
  );
}

export default function PivotLayoutBuilder({
  dimensionOptions,
  metricOptions,
  rowDims,
  colDims,
  metrics,
  loading,
  onRowDimsChange,
  onColDimsChange,
  onMetricsChange,
}: PivotLayoutBuilderProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeKind, setActiveKind] = useState<Kind | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const dimLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of dimensionOptions) map.set(o.value, o.label);
    for (const o of metricOptions) map.set(o.value, o.label);
    return map;
  }, [dimensionOptions, metricOptions]);

  const activeItem = useMemo(() => {
    if (!activeId) return null;
    return {
      id: activeId,
      value: parseValue(activeId),
      label: dimLabels.get(parseValue(activeId)) ?? parseValue(activeId),
    };
  }, [activeId, dimLabels]);

  const removeFrom = useCallback(
    (zone: Zone, value: string) => {
      if (zone === "rows") onRowDimsChange(rowDims.filter((v) => v !== value));
      else if (zone === "cols")
        onColDimsChange(colDims.filter((v) => v !== value));
      else if (zone === "values")
        onMetricsChange(metrics.filter((v) => v !== value));
    },
    [
      rowDims,
      colDims,
      metrics,
      onRowDimsChange,
      onColDimsChange,
      onMetricsChange,
    ],
  );

  const addTo = useCallback(
    (zone: Zone, value: string) => {
      if (zone === "rows" && !rowDims.includes(value))
        onRowDimsChange([...rowDims, value]);
      else if (zone === "cols" && !colDims.includes(value))
        onColDimsChange([...colDims, value]);
      else if (zone === "values" && !metrics.includes(value))
        onMetricsChange([...metrics, value]);
    },
    [
      rowDims,
      colDims,
      metrics,
      onRowDimsChange,
      onColDimsChange,
      onMetricsChange,
    ],
  );

  const reorder = useCallback(
    (zone: Zone, value: string, overId: string) => {
      const list =
        zone === "rows" ? rowDims : zone === "cols" ? colDims : metrics;
      const setList =
        zone === "rows"
          ? onRowDimsChange
          : zone === "cols"
            ? onColDimsChange
            : onMetricsChange;
      const oldIndex = list.indexOf(value);
      const overValue = parseValue(overId);
      const newIndex = overValue ? list.indexOf(overValue) : list.length - 1;
      if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
        setList(arrayMove(list, oldIndex, newIndex));
      }
    },
    [
      rowDims,
      colDims,
      metrics,
      onRowDimsChange,
      onColDimsChange,
      onMetricsChange,
    ],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      setActiveKind(null);
      const { active, over } = event;
      if (!over) return;
      const activeZone = parseZone(String(active.id));
      const activeValue = parseValue(String(active.id));
      const activeItemKind = active.data.current?.kind as Kind | undefined;
      const targetZone = parseZone(String(over.id));
      if (!activeValue || !activeItemKind) return;

      // Dropped back into the pool: remove from the source zone.
      if (targetZone === "pool") {
        removeFrom(activeZone, activeValue);
        return;
      }
      // Kind/zone compatibility: dims go to rows/cols, metrics to values.
      if (
        (activeItemKind === "dim" && targetZone === "values") ||
        (activeItemKind === "metric" &&
          (targetZone === "rows" || targetZone === "cols"))
      ) {
        return;
      }
      if (activeZone === "pool") {
        addTo(targetZone, activeValue);
        return;
      }
      if (activeZone !== targetZone) {
        removeFrom(activeZone, activeValue);
        addTo(targetZone, activeValue);
        return;
      }
      reorder(activeZone, activeValue, String(over.id));
    },
    [removeFrom, addTo, reorder],
  );

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 2 }}>
        <CircularProgress size={18} />
      </Box>
    );
  }

  const poolDims = dimensionOptions;
  const poolMetrics = metricOptions;

  return (
    <Card
      elevation={0}
      sx={{
        flex: 1,
        minWidth: { md: 300 },
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        overflow: "hidden",
        // The theme's hover translateY would become the containing block
        // for the drag overlay's fixed positioning, breaking follow-pointer.
        "&:hover": { transform: "none" },
      }}
    >
      <CardHeader
        sx={{
          px: 1,
          py: 0.25,
          bgcolor: "grey.50",
          borderBottom: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
        }}
        title={
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            透视布局
          </Typography>
        }
        action={
          <Typography variant="caption" color="text.secondary">
            拖拽字段到对应区域
          </Typography>
        }
      />
      <CardContent
        sx={{
          p: 1,
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={(e: DragStartEvent) => {
            setActiveId(String(e.active.id));
            setActiveKind(
              (e.active.data.current?.kind as Kind | undefined) ?? null,
            );
          }}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            setActiveId(null);
            setActiveKind(null);
          }}
        >
          {/* Excel-style 2x2 pivot layout:
              ┌──────────┬──────────┐
              │ 可用字段  │ 列字段   │
              ├──────────┼──────────┤
              │ 行字段    │ 指标字段 │
              └──────────┴──────────┘ */}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gridTemplateRows: "1fr 1fr",
              gap: 0.75,
              flex: 1,
              minHeight: 0,
            }}
          >
            <ZoneFrame title="可用字段" icon={CategoryIcon}>
              <PoolDropArea dims={poolDims} metrics={poolMetrics} />
            </ZoneFrame>

            <ZoneFrame
              title="列字段"
              icon={ViewColumnIcon}
              kind="dim"
              count={colDims.length}
            >
              <ZoneDropArea
                zone="cols"
                items={colDims}
                labelMap={dimLabels}
                kind="dim"
                activeKind={activeKind}
                onRemove={(v) => removeFrom("cols", v)}
                emptyHint="拖入列字段"
              />
            </ZoneFrame>

            <ZoneFrame
              title="行字段"
              icon={ViewAgendaIcon}
              kind="dim"
              count={rowDims.length}
            >
              <ZoneDropArea
                zone="rows"
                items={rowDims}
                labelMap={dimLabels}
                kind="dim"
                activeKind={activeKind}
                onRemove={(v) => removeFrom("rows", v)}
                emptyHint="拖入行字段"
              />
            </ZoneFrame>

            <ZoneFrame
              title="指标字段"
              icon={FunctionsIcon}
              kind="metric"
              count={metrics.length}
            >
              <ZoneDropArea
                zone="values"
                items={metrics}
                labelMap={dimLabels}
                kind="metric"
                activeKind={activeKind}
                onRemove={(v) => removeFrom("values", v)}
                emptyHint="拖入指标字段"
              />
            </ZoneFrame>
          </Box>

          <DragOverlay dropAnimation={null}>
            {activeItem ? (
              <Box
                sx={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  gap: 0.75,
                  pl: 0.75,
                  pr: 1,
                  py: 0.5,
                  bgcolor: "background.paper",
                  borderRadius: 1.5,
                  overflow: "hidden",
                  boxShadow:
                    "var(--mui-palette-shadow-modal), var(--mui-palette-shadow-glow)",
                  border: "1px solid",
                  borderColor:
                    activeKind === "metric" ? "success.light" : "primary.light",
                }}
              >
                <Box
                  sx={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: 3,
                    bgcolor:
                      activeKind === "metric" ? "success.main" : "primary.main",
                  }}
                />
                {(() => {
                  const Icon = KIND_ICONS[activeKind ?? "dim"];
                  return (
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        bgcolor:
                          activeKind === "metric"
                            ? "success.container"
                            : "primary.container",
                        color:
                          activeKind === "metric"
                            ? "success.main"
                            : "primary.main",
                        flexShrink: 0,
                      }}
                    >
                      <Icon sx={{ fontSize: 13 }} />
                    </Box>
                  );
                })()}
                <Typography
                  variant="caption"
                  sx={{
                    fontWeight: 700,
                    pl: 0.5,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {activeItem.label}
                </Typography>
                <Box sx={{ flex: 1 }} />
                <AddCircleIcon
                  sx={{ fontSize: 14, color: "success.main", flexShrink: 0 }}
                />
              </Box>
            ) : null}
          </DragOverlay>
        </DndContext>
      </CardContent>
    </Card>
  );
}

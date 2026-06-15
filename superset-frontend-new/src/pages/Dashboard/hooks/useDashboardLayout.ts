import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { produce } from "immer";
import api from "@/api";
import type { ChartData, DashboardPosition } from "@/types/api";
import { type LayoutNode } from "@/utils/dashboard/layout";
import { useNavStore } from "@/store/navStore";
import { useDrawerStore } from "@/store/drawerState";

interface UseDashboardLayoutParams {
  dashboardId: string;
  nodeMap: Record<string, LayoutNode>;
  chartMeta: Record<number, ChartData>;
  onNodeMapChange: (nodeMap: Record<string, LayoutNode>) => void;
}

export function useDashboardLayout({
  dashboardId,
  nodeMap,
  chartMeta,
  onNodeMapChange,
}: UseDashboardLayoutParams) {
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [containerWidth, setContainerWidth] = useState(1200);
  const containerRef = useRef<HTMLDivElement>(null);

  const nodeMapRef = useRef(nodeMap);
  nodeMapRef.current = nodeMap;

  const chartMetaRef = useRef(chartMeta);
  chartMetaRef.current = chartMeta;

  const fullPositionRef = useRef<DashboardPosition>({});
  const isSavingRef = useRef(false);
  const saveLayoutRef = useRef<() => Promise<void>>();
  const layoutSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sidePanelPinned = useNavStore((s) => s.sidePanelPinned);
  const aiDrawerOpen = useDrawerStore((s) => s.aiDrawerOpen);

  const nodeCount = useMemo(
    () => Object.keys(nodeMap).filter((k) => nodeMap[k].type === "CHART").length,
    [nodeMap],
  );

  const chartMetaCount = useMemo(
    () => Object.keys(chartMeta).length,
    [chartMeta],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [sidePanelPinned, aiDrawerOpen, nodeCount, chartMetaCount]);

  const saveLayout = useCallback(async () => {
    if (!dashboardId) return;
    isSavingRef.current = true;
    setSaving(true);
    try {
      const updatedPosition = produce(fullPositionRef.current, (draft) => {
        const d = draft as DashboardPosition;
        (d as Record<string, unknown>)["DASHBOARD_VERSION_KEY"] = "v2";

        for (const [key, node] of Object.entries(nodeMapRef.current)) {
          if (!node.type) continue;
          if (
            node.type === "CHART" &&
            node.meta?.chartId != null &&
            !chartMetaRef.current[node.meta.chartId as number]
          ) {
            delete d[key];
            continue;
          }
          d[key] = { ...node };
        }

        for (const key of Object.keys(d)) {
          const n = d[key];
          if (
            n &&
            typeof n === "object" &&
            "children" in n &&
            Array.isArray(n.children)
          ) {
            n.children = n.children.filter(
              (childId: string) =>
                d[childId] && typeof d[childId] === "object",
            );
          }
        }

        for (const key of Object.keys(d)) {
          const n = d[key];
          if (
            n &&
            typeof n === "object" &&
            n.type === "CHART" &&
            !nodeMapRef.current[key]
          ) {
            delete d[key];
          }
        }

        const rootKey = Object.keys(d).find((k) => {
          const v = d[k];
          return v?.type === "ROOT";
        });
        if (rootKey && rootKey !== "ROOT_ID") {
          const rootVal = d[rootKey];
          if (rootVal) {
            d["ROOT_ID"] = { ...rootVal, id: "ROOT_ID" };
            delete d[rootKey];
            const children = d["ROOT_ID"];
            const gridId = (children?.children as string[] | undefined)?.[0];
            if (gridId && gridId !== "GRID_ID" && d[gridId]) {
              const gridVal = d[gridId];
              if (gridVal) {
                d["GRID_ID"] = { ...gridVal, id: "GRID_ID" };
                delete d[gridId];
                const replaceChildRef = (obj: Record<string, unknown>) => {
                  const kids = obj.children as string[] | undefined;
                  if (kids) {
                    obj.children = kids.map((c) =>
                      c === gridId ? "GRID_ID" : c,
                    );
                  }
                };
                replaceChildRef(d["ROOT_ID"] as Record<string, unknown>);
                replaceChildRef(d["GRID_ID"] as Record<string, unknown>);
              }
            }
          }
        }
      }) as DashboardPosition;
      const saved = JSON.stringify(updatedPosition);
      await api.put(`/dashboard/${dashboardId}`, {
        position_json: saved,
      });
      fullPositionRef.current = updatedPosition;
    } catch {
      // layout save failure should not disrupt UX
    } finally {
      setSaving(false);
      isSavingRef.current = false;
    }
  }, [dashboardId]);
  saveLayoutRef.current = saveLayout;

  const handleLayoutChange = useCallback(
    (
      newLayout: { i: string; x: number; y: number; w: number; h: number }[],
    ) => {
      if (containerWidth < 600) return;
      const updated = produce(nodeMapRef.current, (draft) => {
        for (const item of newLayout) {
          if (draft[item.i]?.meta) {
            draft[item.i].meta = {
              ...draft[item.i].meta,
              width: item.w,
              height: Math.round((item.h * 60) / 8),
              x: item.x,
              y: item.y,
            };
          }
        }
      });
      nodeMapRef.current = updated;
      onNodeMapChange(updated);
      if (layoutSaveTimerRef.current)
        clearTimeout(layoutSaveTimerRef.current);
      layoutSaveTimerRef.current = setTimeout(() => {
        saveLayoutRef.current?.();
      }, 300);
    },
    [containerWidth],
  );

  return {
    isDragging,
    setIsDragging,
    saving,
    containerWidth,
    containerRef,
    nodeMapRef,
    fullPositionRef,
    saveLayout,
    saveLayoutRef,
    handleLayoutChange,
    setFullPosition: (data: DashboardPosition) => {
      fullPositionRef.current = data;
    },
  };
}

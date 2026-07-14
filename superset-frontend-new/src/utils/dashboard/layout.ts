export interface LayoutNode {
  id: string;
  type: string;
  children: string[];
  meta?: Record<string, unknown>;
}

export interface ChartLayoutItem {
  i: string;
  w: number;
  h: number;
  chartId: number;
  sliceName?: string;
}

export function flattenLayout(
  nodeMap: Record<string, LayoutNode>,
  gridId: string,
): ChartLayoutItem[] {
  const items: ChartLayoutItem[] = [];

  function walk(nodeId: string) {
    const node = nodeMap[nodeId];
    if (!node) return;
    if (node.type === "CHART") {
      items.push({
        i: node.id,
        w: (node.meta?.width as number) || 6,
        h: (node.meta?.height as number) || 14,
        chartId: node.meta?.chartId as number,
        sliceName: node.meta?.sliceName as string,
      });
      return;
    }
    for (const childId of node.children || []) {
      walk(childId);
    }
  }

  if (gridId) walk(gridId);
  return items;
}

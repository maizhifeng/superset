export interface LayoutNode {
  id: string;
  type: string;
  children: string[];
  meta?: Record<string, unknown>;
}

export interface ChartLayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW: number;
  minH: number;
  chartId: number;
  sliceName?: string;
}

function getChildWidth(node: LayoutNode, parentWidth: number): number {
  if (!node) return 0;
  if (node.type === "CHART") return (node.meta?.width as number) || 4;
  if (node.type === "COLUMN")
    return (node.meta?.width as number) || parentWidth;
  return parentWidth;
}

export function flattenLayout(
  nodeMap: Record<string, LayoutNode>,
  gridId: string,
): ChartLayoutItem[] {
  const items: ChartLayoutItem[] = [];
  function processNode(
    nodeId: string,
    parentWidth: number,
    offsetX: number,
    offsetY: number,
  ) {
    const node = nodeMap[nodeId];
    if (!node) return { height: 0 };
    if (node.type === "CHART") {
      const w = (node.meta?.width as number) || 4;
      const h = Math.max(
        Math.round((((node.meta?.height as number) || 30) * 8) / 60),
        3,
      );
      const savedX = node.meta?.x as number | undefined;
      const savedY = node.meta?.y as number | undefined;
      items.push({
        i: node.id,
        x: savedX ?? offsetX,
        y: savedY ?? offsetY,
        w: Math.min(w, 12),
        h,
        minW: 2,
        minH: 3,
        chartId: node.meta?.chartId as number,
        sliceName: node.meta?.sliceName as string,
      });
      return { height: h };
    }
    if (node.type === "ROW") {
      const children = (node.children || []).filter((id) => nodeMap[id]);
      let xOff = 0;
      let maxH = 0;
      for (const childId of children) {
        const cw = getChildWidth(nodeMap[childId], parentWidth);
        const r = processNode(childId, parentWidth, offsetX + xOff, offsetY);
        xOff += cw;
        maxH = Math.max(maxH, r.height);
      }
      return { height: maxH };
    }
    if (node.type === "COLUMN") {
      const cw = (node.meta?.width as number) || parentWidth;
      const children = (node.children || []).filter((id) => nodeMap[id]);
      let yOff = 0;
      for (const childId of children) {
        const r = processNode(childId, cw, offsetX, offsetY + yOff);
        yOff += r.height;
      }
      return { height: yOff };
    }
    if (node.type === "GRID") {
      const children = (node.children || []).filter((id) => nodeMap[id]);
      let yOff = 0;
      for (const childId of children) {
        const r = processNode(childId, 12, 0, yOff);
        yOff += r.height;
      }
      return { height: yOff };
    }
    return { height: 0 };
  }
  if (gridId) processNode(gridId, 12, 0, 0);
  return items;
}

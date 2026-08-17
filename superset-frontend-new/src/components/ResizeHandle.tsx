import { useCallback, useRef } from "react";
import Box from "@mui/material/Box";

interface ResizeHandleProps {
  /** 初始高度（拖拽起点），由父组件传入当前值。 */
  baseHeight: number;
  minHeight: number;
  maxHeight: number;
  /** 拖拽过程中回调新的高度。 */
  onResize: (height: number) => void;
  title?: string;
}

/**
 * 一个轻量的垂直拖拽分隔条句柄。按下后监听 window 级 mousemove，
 * 以 baseHeight 为起点计算新高度并 clamp 到 [minHeight, maxHeight]，
 * 用于实现编辑区高度可垂直拖拽。
 */
export default function ResizeHandle({
  baseHeight,
  minHeight,
  maxHeight,
  onResize,
  title = "拖拽调整高度",
}: ResizeHandleProps) {
  const dragRef = useRef<{ startY: number } | null>(null);

  const setClamped = useCallback(
    (h: number) => {
      onResize(Math.min(maxHeight, Math.max(minHeight, h)));
    },
    [onResize, minHeight, maxHeight],
  );

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragRef.current) return;
      setClamped(baseHeight + (e.clientY - dragRef.current.startY));
    },
    [baseHeight, setClamped],
  );

  const onMouseUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [onMouseMove]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startY: e.clientY };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
    },
    [onMouseMove, onMouseUp],
  );

  return (
    <Box
      onMouseDown={onMouseDown}
      title={title}
      sx={{
        height: 8,
        flexShrink: 0,
        cursor: "ns-resize",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        touchAction: "none",
        "&:hover .resize-handle-bar": { bgcolor: "primary.main" },
      }}
    >
      <Box
        className="resize-handle-bar"
        sx={{
          width: 40,
          height: 3,
          borderRadius: 2,
          bgcolor: "divider",
          transition: "background-color 150ms",
        }}
      />
    </Box>
  );
}

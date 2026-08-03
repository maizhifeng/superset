import { useRef, useCallback, useEffect } from "react";

export function useAiDrawerResize(
  drawerWidth: number,
  onWidthChange: (w: number) => void,
) {
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      draggingRef.current = true;
      startXRef.current = e.clientX;
      startWidthRef.current = drawerWidth;
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    },
    [drawerWidth],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const delta = startXRef.current - e.clientX;
      const newWidth = Math.min(
        Math.max(startWidthRef.current + delta, 360),
        window.innerWidth * 0.8,
      );
      onWidthChange(newWidth);
    };
    const handleMouseUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onWidthChange]);

  return handleMouseDown;
}

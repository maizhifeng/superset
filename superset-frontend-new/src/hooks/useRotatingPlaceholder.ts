import { useState, useEffect, useRef } from 'react';

interface UseRotatingPlaceholderOptions {
  hints: string[];
  intervalMs?: number;
  enabled?: boolean;
}

export function useRotatingPlaceholder({
  hints,
  intervalMs = 3000,
  enabled = true,
}: UseRotatingPlaceholderOptions): string {
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!enabled || hints.length <= 1) {
      setIndex(0);
      return;
    }
    timerRef.current = setInterval(() => {
      setIndex(prev => (prev + 1) % hints.length);
    }, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [hints.length, intervalMs, enabled]);

  return hints[index] ?? hints[0] ?? '';
}

import { useState, useEffect, useRef, useCallback } from "react";

const DEFAULT_INTERVAL = 300;

interface UseAutoRefreshOptions {
  intervalSeconds?: number;
  enabled?: boolean;
  onRefresh: () => void;
}

interface UseAutoRefreshResult {
  countdown: number;
  intervalSeconds: number;
  setIntervalSeconds: (s: number) => void;
  setEnabled: (v: boolean) => void;
  enabled: boolean;
  resetCountdown: () => void;
}

export default function useAutoRefresh({
  intervalSeconds: initialInterval = DEFAULT_INTERVAL,
  enabled: initialEnabled = true,
  onRefresh,
}: UseAutoRefreshOptions): UseAutoRefreshResult {
  const [countdown, setCountdown] = useState(initialInterval);
  const [intervalSeconds, setIntervalSeconds] = useState(initialInterval);
  const [enabled, setEnabled] = useState(initialEnabled);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const resetCountdown = useCallback(() => {
    setCountdown(intervalSeconds);
  }, [intervalSeconds]);

  useEffect(() => {
    if (!enabled || intervalSeconds <= 0) {
      setCountdown(intervalSeconds);
      return;
    }

    const id = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          onRefreshRef.current();
          return intervalSeconds;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [enabled, intervalSeconds]);

  useEffect(() => {
    setCountdown(intervalSeconds);
  }, [intervalSeconds]);

  return {
    countdown,
    intervalSeconds,
    setIntervalSeconds,
    setEnabled,
    enabled,
    resetCountdown,
  };
}

import { QueryClient } from "@tanstack/react-query";

/**
 * Shared react-query client for the frontend.
 *
 * Chart-data requests are (ab)used from both hooks that render through
 * ``useQuery`` and imperative flows that call ``queryClient.fetchQuery``
 * (dashboard chart sheet, filter-driven refresh).  The knobs below keep
 * server round-trips minimal while never serving stale data on an explicit
 * ``force`` refresh.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 0,
    },
  },
});

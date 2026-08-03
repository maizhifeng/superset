import { renderHook, waitFor, act } from "@testing-library/react";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import api from "@/api";
import { test, expect, vi, beforeEach } from "vitest";
import { mockPaginatedResponse, mockCharts } from "@fixtures/chartData";

vi.mock("@/api", () => ({
  default: {
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test("fetches data on mount", async () => {
  vi.mocked(api.get).mockResolvedValueOnce({
    data: mockPaginatedResponse,
  });

  const { result } = renderHook(() =>
    usePaginatedList({
      endpoint: "/chart/",
      filterColumn: "slice_name",
    }),
  );

  expect(result.current.loading).toBe(true);

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.rows).toEqual(mockCharts);
  expect(result.current.rowCount).toBe(3);
  expect(result.current.error).toBeNull();
});

test("handles API error", async () => {
  vi.mocked(api.get).mockRejectedValueOnce({
    response: { data: { message: "Server error" } },
  });

  const { result } = renderHook(() =>
    usePaginatedList({
      endpoint: "/chart/",
      filterColumn: "slice_name",
    }),
  );

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.error).toBe("Server error");
  expect(result.current.rows).toEqual([]);
});

test("uses custom error message fallback", async () => {
  vi.mocked(api.get).mockRejectedValueOnce(new Error("Network error"));

  const { result } = renderHook(() =>
    usePaginatedList({
      endpoint: "/chart/",
      filterColumn: "slice_name",
      errorMessage: "Custom error",
    }),
  );

  await waitFor(() => expect(result.current.loading).toBe(false));

  expect(result.current.error).toBe("Network error");
});

test("search text change resets page to 0", async () => {
  vi.mocked(api.get).mockResolvedValue({ data: mockPaginatedResponse });

  const { result } = renderHook(() =>
    usePaginatedList({
      endpoint: "/chart/",
      filterColumn: "slice_name",
    }),
  );

  await waitFor(() => expect(result.current.loading).toBe(false));

  act(() => {
    result.current.setPaginationModel({ page: 2, pageSize: 50 });
  });

  act(() => {
    result.current.handleSearchChange("sales");
  });

  await waitFor(() => expect(result.current.searchText).toBe("sales"));
  expect(result.current.paginationModel.page).toBe(0);
});

test("handleDelete sends delete request and refreshes", async () => {
  vi.mocked(api.get).mockResolvedValue({ data: mockPaginatedResponse });
  vi.mocked(api.delete).mockResolvedValue({ data: {} });

  const { result } = renderHook(() =>
    usePaginatedList({
      endpoint: "/chart/",
      filterColumn: "slice_name",
    }),
  );

  await waitFor(() => expect(result.current.loading).toBe(false));

  vi.mocked(api.get).mockClear();

  act(() => {
    result.current.setDeleteTarget({ id: 1, name: "Test Chart" });
  });

  await act(async () => {
    await result.current.handleDelete();
  });

  expect(api.delete).toHaveBeenCalledWith("/chart/1");
  expect(result.current.deleteTarget).toBeNull();
});

test("handleDelete does nothing without deleteTarget", async () => {
  vi.mocked(api.get).mockResolvedValue({ data: mockPaginatedResponse });

  const { result } = renderHook(() =>
    usePaginatedList({
      endpoint: "/chart/",
      filterColumn: "slice_name",
    }),
  );

  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => {
    await result.current.handleDelete();
  });

  expect(api.delete).not.toHaveBeenCalled();
});

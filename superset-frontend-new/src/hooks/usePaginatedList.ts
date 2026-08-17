import { useState, useEffect, useCallback, useRef } from "react";
import rison from "rison";
import api from "@/api";
import { parseErrorMessage } from "@/utils/parseErrorMessage";

export interface SortModel {
  field: string;
  sort: "asc" | "desc";
}

const SEARCH_DEBOUNCE_MS = 300;
/** 全局列表每页行数偏好（localStorage）。 */
const PAGE_SIZE_KEY = "superset-list-page-size";

export interface ListFilter {
  col: string;
  opr: string;
  value: string | number | boolean;
}

interface UsePaginatedListOptions {
  endpoint: string;
  filterColumn: string;
  pageSize?: number;
  errorMessage?: string;
  sortFieldMap?: Record<string, string>;
  defaultSortModel?: SortModel[];
  /** 额外的服务端过滤条件，与搜索过滤合并（如按图表类型过滤）。 */
  extraFilters?: ListFilter[];
}

export interface PaginatedListResult<T> {
  rows: T[];
  rowCount: number;
  loading: boolean;
  error: string | null;
  searchText: string;
  paginationModel: { page: number; pageSize: number };
  sortModel: SortModel[];
  extraFilters: ListFilter[];
  deleteTarget: { id: number; name: string } | null;
  deleteLoading: boolean;
  deleteError: string | null;
  setSearchText: (v: string) => void;
  setPaginationModel: (m: { page: number; pageSize: number }) => void;
  setSortModel: (m: SortModel[]) => void;
  setExtraFilters: (f: ListFilter[]) => void;
  setDeleteTarget: (t: { id: number; name: string } | null) => void;
  handleSearchChange: (v: string) => void;
  handleDelete: () => Promise<void>;
  fetchData: () => void;
}

export function usePaginatedList<T>(
  options: UsePaginatedListOptions,
): PaginatedListResult<T> {
  const {
    endpoint,
    filterColumn,
    pageSize = 50,
    errorMessage = "Failed to load data",
    sortFieldMap,
    defaultSortModel,
    extraFilters: initialExtraFilters,
  } = options;

  const [rows, setRows] = useState<T[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [extraFilters, setExtraFilters] = useState<ListFilter[]>(
    initialExtraFilters ?? [],
  );
  const [paginationModel, setPaginationModel] = useState(() => {
    // 未显式指定 pageSize 时，恢复用户上次选择的每页行数（默认 50）。
    let size = pageSize;
    if (options.pageSize === undefined) {
      const saved = Number(localStorage.getItem(PAGE_SIZE_KEY));
      if (Number.isFinite(saved) && saved > 0) size = saved;
    }
    return { page: 0, pageSize: size };
  });
  const [sortModel, setSortModel] = useState<SortModel[]>(
    defaultSortModel ?? [],
  );
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const searchLoaded = useRef(false);
  const sortLoaded = useRef(false);
  const extraFilterLoaded = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController | null>(null);

  const configRef = useRef({
    endpoint,
    filterColumn,
    errorMessage,
    sortFieldMap,
  });
  configRef.current = { endpoint, filterColumn, errorMessage, sortFieldMap };

  const fetchData = useCallback(() => {
    const { endpoint, filterColumn, errorMessage, sortFieldMap } =
      configRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);

    // Only single-column sort is sent to the API (multi-column not supported by list endpoints)
    const sortEntry = sortModel[0];
    const orderField = sortEntry
      ? (sortFieldMap?.[sortEntry.field] ?? sortEntry.field)
      : undefined;
    const orderDirection = sortEntry?.sort;

    const filters: ListFilter[] = [
      ...(searchText
        ? [{ col: filterColumn, opr: "ct", value: searchText }]
        : []),
      ...extraFilters,
    ];

    const qs = rison.encode({
      page_size: paginationModel.pageSize,
      page: paginationModel.page,
      ...(filters.length > 0 ? { filters } : {}),
      ...(orderField && {
        order_column: orderField,
        order_direction: orderDirection,
      }),
    });
    api
      .get<{ result: T[]; count: number }>(`${endpoint}?q=${qs}`, {
        signal: controller.signal,
      })
      .then((res) => {
        if (controller.signal.aborted) return;
        setRows(res.data.result);
        setRowCount(res.data.count);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(parseErrorMessage(err, errorMessage));
        setLoading(false);
      });
  }, [paginationModel, searchText, sortModel, extraFilters]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      clearTimeout(debounceTimerRef.current);
    };
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 记住用户选择的每页行数，跨列表页共享。
  useEffect(() => {
    localStorage.setItem(PAGE_SIZE_KEY, String(paginationModel.pageSize));
  }, [paginationModel.pageSize]);

  useEffect(() => {
    if (searchLoaded.current) {
      setPaginationModel((prev) => ({ ...prev, page: 0 }));
    }
    searchLoaded.current = true;
  }, [searchText]);  useEffect(() => {
    if (sortLoaded.current) {
      setPaginationModel((prev) => ({ ...prev, page: 0 }));
    }
    sortLoaded.current = true;
  }, [sortModel]);

  useEffect(() => {
    if (extraFilterLoaded.current) {
      setPaginationModel((prev) => ({ ...prev, page: 0 }));
    }
    extraFilterLoaded.current = true;
  }, [extraFilters]);

  const handleSearchChange = useCallback((v: string) => {
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      setSearchText(v);
    }, SEARCH_DEBOUNCE_MS);
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await api.delete(`${endpoint}${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchData();
    } catch (err: unknown) {
      setDeleteError(parseErrorMessage(err, "Delete failed"));
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  return {
    rows,
    rowCount,
    loading,
    error,
    searchText,
    paginationModel,
    sortModel,
    extraFilters,
    deleteTarget,
    deleteLoading,
    deleteError,
    setSearchText,
    setPaginationModel,
    setSortModel,
    setExtraFilters,
    setDeleteTarget,
    handleSearchChange,
    handleDelete,
    fetchData,
  };
}

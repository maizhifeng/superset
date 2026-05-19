import { useState, useEffect, useCallback, useRef } from "react";
import rison from "rison";
import api from "@/api";
import { parseErrorMessage } from "@/utils/parseErrorMessage";

export interface SortModel {
  field: string;
  sort: "asc" | "desc";
}

const SEARCH_DEBOUNCE_MS = 300;

interface UsePaginatedListOptions {
  endpoint: string;
  filterColumn: string;
  pageSize?: number;
  errorMessage?: string;
  sortFieldMap?: Record<string, string>;
  defaultSortModel?: SortModel[];
}

export interface PaginatedListResult<T> {
  rows: T[];
  rowCount: number;
  loading: boolean;
  error: string | null;
  searchText: string;
  paginationModel: { page: number; pageSize: number };
  sortModel: SortModel[];
  deleteTarget: { id: number; name: string } | null;
  deleteLoading: boolean;
  deleteError: string | null;
  setSearchText: (v: string) => void;
  setPaginationModel: (m: { page: number; pageSize: number }) => void;
  setSortModel: (m: SortModel[]) => void;
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
  } = options;

  const [rows, setRows] = useState<T[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize });
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
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();

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
    setLoading(true);
    setError(null);

    // Only single-column sort is sent to the API (multi-column not supported by list endpoints)
    const sortEntry = sortModel[0];
    const orderField = sortEntry
      ? (sortFieldMap?.[sortEntry.field] ?? sortEntry.field)
      : undefined;
    const orderDirection = sortEntry?.sort;

    const qs = rison.encode({
      page_size: paginationModel.pageSize,
      page: paginationModel.page,
      ...(searchText && {
        filters: [{ col: filterColumn, opr: "ct", value: searchText }],
      }),
      ...(orderField && {
        order_column: orderField,
        order_direction: orderDirection,
      }),
    });
    api
      .get<{ result: T[]; count: number }>(`${endpoint}?q=${qs}`)
      .then((res) => {
        setRows(res.data.result);
        setRowCount(res.data.count);
        setLoading(false);
      })
      .catch((err) => {
        setError(parseErrorMessage(err, errorMessage));
        setLoading(false);
      });
  }, [paginationModel, searchText, sortModel]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (searchLoaded.current) {
      setPaginationModel((prev) => ({ ...prev, page: 0 }));
    }
    searchLoaded.current = true;
  }, [searchText]);

  useEffect(() => {
    if (sortLoaded.current) {
      setPaginationModel((prev) => ({ ...prev, page: 0 }));
    }
    sortLoaded.current = true;
  }, [sortModel]);

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
    deleteTarget,
    deleteLoading,
    deleteError,
    setSearchText,
    setPaginationModel,
    setSortModel,
    setDeleteTarget,
    handleSearchChange,
    handleDelete,
    fetchData,
  };
}

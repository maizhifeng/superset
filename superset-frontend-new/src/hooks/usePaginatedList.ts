import { useState, useEffect, useCallback, useRef } from 'react';
import rison from 'rison';
import api from '@/api';
import { parseErrorMessage } from '@/utils/parseErrorMessage';

const SEARCH_DEBOUNCE_MS = 300;

interface UsePaginatedListOptions {
  endpoint: string;
  filterColumn: string;
  pageSize?: number;
  errorMessage?: string;
}

export interface PaginatedListResult<T> {
  rows: T[];
  rowCount: number;
  loading: boolean;
  error: string | null;
  searchText: string;
  paginationModel: { page: number; pageSize: number };
  deleteTarget: { id: number; name: string } | null;
  deleteLoading: boolean;
  deleteError: string | null;
  setSearchText: (v: string) => void;
  setPaginationModel: (m: { page: number; pageSize: number }) => void;
  setDeleteTarget: (t: { id: number; name: string } | null) => void;
  handleSearchChange: (v: string) => void;
  handleDelete: () => Promise<void>;
  fetchData: () => void;
}

export function usePaginatedList<T>(
  options: UsePaginatedListOptions,
): PaginatedListResult<T> {
  const { endpoint, filterColumn, pageSize = 50, errorMessage = 'Failed to load data' } = options;

  const [rows, setRows] = useState<T[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize });
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const searchLoaded = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    const qs = rison.encode({
      page_size: paginationModel.pageSize,
      page: paginationModel.page,
      ...(searchText && { filters: [{ col: filterColumn, opr: 'ct', value: searchText }] }),
    });
    api.get<{ result: T[]; count: number }>(`${endpoint}?q=${qs}`)
      .then(res => {
        setRows(res.data.result);
        setRowCount(res.data.count);
        setLoading(false);
      })
      .catch(err => {
        setError(parseErrorMessage(err, errorMessage));
        setLoading(false);
      });
  }, [paginationModel, searchText, endpoint, filterColumn, errorMessage]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (searchLoaded.current) {
      setPaginationModel(prev => ({ ...prev, page: 0 }));
    }
    searchLoaded.current = true;
  }, [searchText]);

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
      setDeleteError(parseErrorMessage(err, 'Delete failed'));
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  return {
    rows, rowCount, loading, error, searchText, paginationModel,
    deleteTarget, deleteLoading, deleteError,
    setSearchText, setPaginationModel, setDeleteTarget,
    handleSearchChange, handleDelete, fetchData,
  };
}

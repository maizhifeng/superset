import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import CardContent from '@mui/material/CardContent';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import SaveIcon from '@mui/icons-material/Save';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { useBreadcrumbStore } from '@/store/breadcrumbStore';
import { useToolbarStore } from '@/contexts/ToolbarContext';
import PageSpeedDial from '@/components/PageSpeedDial';
import { parseErrorMessage } from '@/utils/parseErrorMessage';
import api from '@/api';
import type { DatasetDetail } from '@/types/api';

export default function DatasetEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const setCustom = useBreadcrumbStore(s => s.setCustom);
  const { registerTools, unregisterTools } = useToolbarStore();
  const [dataset, setDataset] = useState<DatasetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({ table_name: '', description: '', sql: '' });

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.get<{ result: DatasetDetail }>(`/dataset/${id}`)
      .then(res => {
        const d = res.data.result;
        setDataset(d);
        setCustom({ label: `Edit: ${d.table_name}` });
        setForm({ table_name: d.table_name, description: d.description ?? '', sql: d.sql ?? '' });
        setLoading(false);
      })
      .catch(err => { setError(parseErrorMessage(err, 'Failed to load dataset')); setLoading(false); });
  }, [id, setCustom]);

  const formRef = useRef(form);
  formRef.current = form;
  const columnsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = useCallback(() => {
    const el = columnsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  const scrollCols = useCallback((dir: 'left' | 'right') => {
    const el = columnsRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -200 : 200, behavior: 'smooth' });
    setTimeout(checkScroll, 100);
  }, [checkScroll]);

  const handleSave = useCallback(async () => {
    if (!id) return;
    const f = formRef.current;
    setError(null); setSuccess(false);
    try {
      await api.put(`/dataset/${id}`, { table_name: f.table_name, description: f.description || null, sql: f.sql || null });
      setSuccess(true);
      setTimeout(() => navigate('/dataset/list'), 1200);
    } catch (err: unknown) {
      const msg = parseErrorMessage(err, 'Save failed');
      setError(msg);
    }
  }, [id, navigate]);

  useEffect(() => {
    registerTools('dataset_edit', [{ id: 'save', priority: 30, showOnMobile: true, primary: true, fabIcon: <SaveIcon />, fabLabel: 'Save', action: handleSave, render: null }]);
    return () => unregisterTools('dataset_edit');
  }, [registerTools, unregisterTools, handleSave]);

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;
  if (error && !dataset) return <Box sx={{ p: 3 }}><Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert></Box>;

  const cardHeaderSx = { '& .MuiCardHeader-title': { fontSize: '0.8125rem', fontWeight: 600 } };

  return (
    <Box sx={{ p: 3 }}>
      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>Dataset saved</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
        <TextField size="small" label="Table Name" value={form.table_name} onChange={e => setForm(f => ({ ...f, table_name: e.target.value }))} sx={{ flex: 2, minWidth: 180 }} />
        <TextField size="small" label="Description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} sx={{ flex: 2, minWidth: 180 }} />
        <TextField size="small" label="Database Connection" value={`${dataset?.database.database_name} · ${dataset?.schema ?? 'public'}`} slotProps={{ input: { readOnly: true } }} sx={{ flex: 1, minWidth: 180 }} />
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5, mt: 1.5 }}>
        {dataset?.kind !== 'physical' && (
          <Card sx={{ flex: 3, minWidth: 0 }}><CardHeader title="SQL" sx={cardHeaderSx} />
            <CardContent sx={{ pt: 0 }}>
              <TextField size="small" value={form.sql} onChange={e => setForm(f => ({ ...f, sql: e.target.value }))} fullWidth multiline minRows={2} maxRows={6}
                sx={{ '& textarea': { fontFamily: 'monospace', fontSize: '0.8125rem', lineHeight: 1.5 } }} />
            </CardContent>
          </Card>
        )}

        {dataset && (dataset.metrics.length > 0 || dataset.columns.length > 0) && (
        <Card sx={{ flex: dataset?.kind !== 'physical' ? 7 : 1, minWidth: 0 }}>
          <CardHeader title={`Fields (${dataset.metrics.length + dataset.columns.length})`} sx={cardHeaderSx}
            action={<Box sx={{ display: 'flex', gap: 0.5, pr: 1 }}>
              <IconButton size="small" disabled={!canScrollLeft} onClick={() => scrollCols('left')}><ChevronLeftIcon fontSize="small" /></IconButton>
              <IconButton size="small" disabled={!canScrollRight} onClick={() => scrollCols('right')}><ChevronRightIcon fontSize="small" /></IconButton>
            </Box>}
          />
          <CardContent sx={{ pt: 0 }}>
            <TableContainer ref={columnsRef} onScroll={checkScroll} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, maxHeight: 400, overflowX: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>{['Name', 'Kind', 'Type', 'Verbose Name', 'Expression', 'Description'].map(h => <TableCell key={h} sx={{ fontWeight: 700, bgcolor: 'grey.50', fontSize: '0.75rem', py: 1 }}>{h}</TableCell>)}</TableRow>
                </TableHead>
                <TableBody>
                  {[
                    ...dataset.metrics.map(m => ({ ...m, _kind: 'metric' as const })),
                    ...dataset.columns.map(c => ({ ...c, _kind: 'column' as const, _type: c.type || '—' })),
                  ].map(row => (
                    <TableRow key={`${row._kind}-${row.id}`} hover sx={{ '&:last-child td': { border: 0 } }}>
                      <TableCell sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
                        {row._kind === 'metric' ? (row as typeof row & { metric_name: string }).metric_name : (row as typeof row & { column_name: string }).column_name}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}>
                        <Chip label={row._kind} size="small" color={row._kind === 'metric' ? 'primary' : 'default'} variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}>
                        {row._kind === 'column' ? <Chip label={(row as typeof row & { _type: string })._type} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem', maxWidth: 100 }} /> : (row as typeof row & { d3format?: string }).d3format ?? ''}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}>{row.verbose_name ?? ''}</TableCell>
                      <TableCell sx={{ fontSize: '0.7rem', fontFamily: 'monospace', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.expression ?? ''}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.description ?? ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}
      </Box>
      <PageSpeedDial pageKeys="dataset_edit" />
    </Box>
  );
}

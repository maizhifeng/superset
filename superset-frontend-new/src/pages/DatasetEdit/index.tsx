import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
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
  const [form, setForm] = useState({ table_name: '', description: '', default_endpoint: '', sql: '' });

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.get<{ result: DatasetDetail }>(`/dataset/${id}`)
      .then(res => {
        const d = res.data.result;
        setDataset(d);
        setCustom({ label: `Edit: ${d.table_name}` });
        setForm({ table_name: d.table_name, description: d.description ?? '', default_endpoint: d.default_endpoint ?? '', sql: d.sql ?? '' });
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
      await api.put(`/dataset/${id}`, { table_name: f.table_name, description: f.description || null, default_endpoint: f.default_endpoint || null, sql: f.sql || null });
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
        <Card sx={{ flex: 1 }}><CardHeader title="Table Name" sx={cardHeaderSx} />
          <CardContent sx={{ pt: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <TextField size="small" value={form.table_name} onChange={e => setForm(f => ({ ...f, table_name: e.target.value }))} fullWidth />
            <TextField label="Description" size="small" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} fullWidth sx={{ display: { xs: 'none', sm: 'block' } }} />
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}><CardHeader title="Database Connection" sx={cardHeaderSx} />
          <CardContent sx={{ pt: 0 }}>
            <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: 'text.secondary', py: 0.75 }}>
              {dataset?.database.database_name} · {dataset?.schema ?? 'public'}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {dataset?.kind !== 'physical' && (
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mt: 1.5 }}>
          <Card sx={{ flex: 2 }}><CardHeader title="SQL" sx={cardHeaderSx} />
            <CardContent sx={{ pt: 0 }}>
              <TextField size="small" value={form.sql} onChange={e => setForm(f => ({ ...f, sql: e.target.value }))} fullWidth multiline minRows={2} maxRows={6}
                sx={{ '& textarea': { fontFamily: 'monospace', fontSize: '0.8125rem', lineHeight: 1.5 } }} />
            </CardContent>
          </Card>
          <Card sx={{ flex: 1 }}><CardHeader title="Default Endpoint" sx={cardHeaderSx} />
            <CardContent sx={{ pt: 0 }}>
              <TextField size="small" value={form.default_endpoint} onChange={e => setForm(f => ({ ...f, default_endpoint: e.target.value }))} fullWidth />
            </CardContent>
          </Card>
        </Box>
      )}

      {dataset && dataset.metrics.length > 0 && (
        <Card sx={{ mt: 1.5 }}>
          <CardHeader title={`Metrics (${dataset.metrics.length})`} sx={cardHeaderSx} />
          <CardContent sx={{ pt: 0 }}>
            <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>{['Metric Name', 'Label', 'Expression', 'Format', 'Description'].map(h => <TableCell key={h} sx={{ fontWeight: 700, bgcolor: 'grey.50', fontSize: '0.75rem', py: 1 }}>{h}</TableCell>)}</TableRow>
                </TableHead>
                <TableBody>
                  {dataset.metrics.map(m => (
                    <TableRow key={m.id} hover sx={{ '&:last-child td': { border: 0 } }}>
                      <TableCell sx={{ fontSize: '0.75rem', fontWeight: 500 }}>{m.metric_name}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}>{m.verbose_name ?? ''}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', fontFamily: 'monospace', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.expression}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}>{m.d3format ?? ''}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}>{m.description ?? ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {dataset && dataset.columns.length > 0 && (
        <Card sx={{ mt: 1.5 }}>
          <CardHeader title={`Columns (${dataset.columns.length})`} sx={cardHeaderSx}
            action={<Box sx={{ display: 'flex', gap: 0.5, pr: 1 }}>
              <IconButton size="small" disabled={!canScrollLeft} onClick={() => scrollCols('left')}><ChevronLeftIcon fontSize="small" /></IconButton>
              <IconButton size="small" disabled={!canScrollRight} onClick={() => scrollCols('right')}><ChevronRightIcon fontSize="small" /></IconButton>
            </Box>}
          />
          <CardContent sx={{ pt: 0 }}>
            <TableContainer ref={columnsRef} onScroll={checkScroll} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, maxHeight: 400, overflowX: 'auto' }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>{['Column Name', 'Type', 'Verbose Name', 'Time', 'Filter', 'Group', 'Expression', 'Description'].map(h => <TableCell key={h} sx={{ fontWeight: 700, bgcolor: 'grey.50', fontSize: '0.75rem', py: 1 }}>{h}</TableCell>)}</TableRow>
                </TableHead>
                <TableBody>
                  {dataset.columns.map(c => (
                    <TableRow key={c.id} hover sx={{ '&:last-child td': { border: 0 } }}>
                      <TableCell sx={{ fontSize: '0.75rem', fontWeight: 500 }}>{c.column_name}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}><Chip label={c.type || '—'} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.65rem', maxWidth: 100 }} /></TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}>{c.verbose_name ?? ''}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}><Chip label={c.is_dttm ? 'Yes' : 'No'} size="small" color={c.is_dttm ? 'warning' : 'default'} variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} /></TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}><Chip label={c.filterable ? 'Y' : 'N'} size="small" color={c.filterable ? 'success' : 'default'} variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} /></TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}><Chip label={c.groupby ? 'Y' : 'N'} size="small" color={c.groupby ? 'success' : 'default'} variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} /></TableCell>
                      <TableCell sx={{ fontSize: '0.7rem', fontFamily: 'monospace', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.expression || ''}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.description ?? ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}
      <PageSpeedDial pageKeys="dataset_edit" />
    </Box>
  );
}

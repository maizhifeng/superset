import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import Chip from '@mui/material/Chip';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import DataGridTable from '@/components/DataGridTable';
import api from '@/api';
import PageHeader from '@/components/PageHeader';

interface DatasetDetail {
  id: number;
  table_name: string;
  schema: string | null;
  description: string | null;
  sql: string | null;
  default_endpoint: string | null;
  filter_select_enabled: boolean;
  fetch_values_predicate: string | null;
  template_params: string | null;
  catalog: string | null;
  kind: string;
  database: { database_name: string; id: number };
  columns: {
    id: number;
    column_name: string;
    type: string;
    verbose_name: string | null;
    is_dttm: boolean;
    description: string | null;
    expression: string | null;
    filterable: boolean;
    groupby: boolean;
    is_active: boolean;
    type_generic: number | null;
  }[];
  metrics: {
    id: number;
    metric_name: string;
    verbose_name: string | null;
    expression: string;
    description: string | null;
    d3format: string | null;
    currency: string | null;
  }[];
}

export default function DatasetEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dataset, setDataset] = useState<DatasetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState({
    table_name: '',
    description: '',
    default_endpoint: '',
    filter_select_enabled: false,
    fetch_values_predicate: '',
    template_params: '',
    sql: '',
  });

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.get(`/dataset/${id}`)
      .then(res => {
        const d = res.data.result as DatasetDetail;
        setDataset(d);
        setForm({
          table_name: d.table_name,
          description: d.description ?? '',
          default_endpoint: d.default_endpoint ?? '',
          filter_select_enabled: d.filter_select_enabled,
          fetch_values_predicate: d.fetch_values_predicate ?? '',
          template_params: d.template_params ?? '',
          sql: d.sql ?? '',
        });
        setLoading(false);
      })
      .catch(err => {
        setError(err?.message ?? 'Failed to load dataset');
        setLoading(false);
      });
  }, [id]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await api.put(`/dataset/${id}`, {
        table_name: form.table_name,
        description: form.description || null,
        default_endpoint: form.default_endpoint || null,
        filter_select_enabled: form.filter_select_enabled,
        fetch_values_predicate: form.fetch_values_predicate || null,
        template_params: form.template_params || null,
        sql: form.sql || null,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        || (err instanceof Error ? err.message : 'Save failed');
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Edit Dataset" />
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  if (error && !dataset) {
    return (
      <Box sx={{ p: 3 }}>
        <PageHeader title="Edit Dataset" />
        <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 'lg', mx: 'auto' }}>
      <PageHeader
        title={`Edit: ${dataset?.table_name || ''}`}
        subtitle={`Dataset #${id} · ${dataset?.database.database_name} · ${dataset?.kind}`}
        actions={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button variant="outlined" size="small" onClick={() => navigate('/dataset/list')}>
              Cancel
            </Button>
            <Button variant="contained" size="small" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </Box>
        }
      />

      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: 2 }}>Dataset saved successfully!</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, fontSize: '0.875rem' }}>
            Basic Information
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Table Name"
              size="small"
              value={form.table_name}
              onChange={e => setForm(f => ({ ...f, table_name: e.target.value }))}
              fullWidth
            />
            <TextField
              label="Description"
              size="small"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              fullWidth
              multiline
              minRows={2}
              maxRows={6}
              sx={{ '& textarea': { fontSize: '0.8125rem', lineHeight: 1.5 } }}
            />
            <TextField
              label="SQL"
              size="small"
              value={form.sql}
              onChange={e => setForm(f => ({ ...f, sql: e.target.value }))}
              fullWidth
              multiline
              minRows={2}
              maxRows={6}
              sx={{ '& textarea': { fontFamily: 'monospace', fontSize: '0.8125rem', lineHeight: 1.5 } }}
            />
            <TextField
              label="Default Endpoint"
              size="small"
              value={form.default_endpoint}
              onChange={e => setForm(f => ({ ...f, default_endpoint: e.target.value }))}
              fullWidth
            />
            <FormControlLabel
              control={
                <Switch
                  checked={form.filter_select_enabled}
                  onChange={e => setForm(f => ({ ...f, filter_select_enabled: e.target.checked }))}
                  size="small"
                />
              }
              label="Filter Select Enabled"
            />
          </Box>
        </Paper>

        {dataset && dataset.metrics.length > 0 && (
          <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, fontSize: '0.875rem' }}>
              Metrics ({dataset.metrics.length})
            </Typography>
            <DataGridTable
              rows={dataset.metrics.map(m => ({ ...m, id: m.id }))}
              columns={[
                { field: 'metric_name', headerName: 'Metric Name', flex: 1 },
                {
                  field: 'verbose_name',
                  headerName: 'Label',
                  width: 180,
                  valueGetter: (_v, row) => row.verbose_name ?? '',
                },
                {
                  field: 'expression',
                  headerName: 'Expression',
                  flex: 1,
                },
                {
                  field: 'd3format',
                  headerName: 'Format',
                  width: 100,
                  valueGetter: (_v, row) => row.d3format ?? '',
                },
                {
                  field: 'description',
                  headerName: 'Description',
                  flex: 1,
                  valueGetter: (_v, row) => row.description ?? '',
                },
              ]}
              autoHeight
              density="compact"
              hideFooter
              disableColumnFilter
              disableColumnMenu
              disableColumnSelector
              disableDensitySelector
              sx={{ '--DataGrid-overlayHeight': '150px', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
            />
          </Paper>
        )}

        {dataset && dataset.columns.length > 0 && (
          <Paper sx={{ p: 3, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, fontSize: '0.875rem' }}>
              Columns ({dataset.columns.length})
            </Typography>
            <DataGridTable
              rows={dataset.columns.map(c => ({ ...c, id: c.id }))}
              columns={[
                { field: 'column_name', headerName: 'Column Name', flex: 1 },
                { field: 'type', headerName: 'Type', width: 130 },
                {
                  field: 'verbose_name',
                  headerName: 'Verbose Name',
                  width: 150,
                  valueGetter: (_v, row) => row.verbose_name ?? '',
                },
                {
                  field: 'is_dttm',
                  headerName: 'Is Time',
                  width: 90,
                  renderCell: params => (
                    <Chip label={params.value ? 'Yes' : 'No'} size="small" color={params.value ? 'warning' : 'default'} variant="outlined" />
                  ),
                },
                {
                  field: 'filterable',
                  headerName: 'Filter',
                  width: 80,
                  renderCell: params => (
                    <Chip label={params.value ? 'Y' : 'N'} size="small" variant="outlined" color={params.value ? 'success' : 'default'} />
                  ),
                },
                {
                  field: 'groupby',
                  headerName: 'Group By',
                  width: 90,
                  renderCell: params => (
                    <Chip label={params.value ? 'Y' : 'N'} size="small" variant="outlined" color={params.value ? 'success' : 'default'} />
                  ),
                },
                {
                  field: 'expression',
                  headerName: 'Expression',
                  width: 180,
                  valueGetter: (_v, row) => row.expression || '',
                },
                {
                  field: 'description',
                  headerName: 'Description',
                  flex: 1,
                  valueGetter: (_v, row) => row.description ?? '',
                },
              ]}
              autoHeight
              density="compact"
              hideFooter
              disableColumnFilter
              disableColumnMenu
              disableColumnSelector
              disableDensitySelector
              sx={{ '--DataGrid-overlayHeight': '150px', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}
            />
          </Paper>
        )}
      </Box>
    </Box>
  );
}

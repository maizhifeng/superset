import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import PageHeader from '@/components/PageHeader';
import api from '@/api';

const CHART_TYPES = ['line', 'bar', 'area', 'pie', 'table', 'big_number', 'big_number_total'];

interface Dataset {
  id: number;
  table_name: string;
}

interface DatasetApiResponse {
  result: Dataset[];
  count: number;
}

export default function ChartCreation() {
  const navigate = useNavigate();

  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [datasourceId, setDatasourceId] = useState('');
  const [vizType, setVizType] = useState('');
  const [metrics, setMetrics] = useState('');
  const [groupby, setGroupby] = useState('');
  const [sliceName, setSliceName] = useState('');

  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<DatasetApiResponse>('/dataset/?q=(page_size:200,page:0)')
      .then(res => {
        setDatasets(res.data.result);
        setLoadingDatasets(false);
      })
      .catch(err => {
        setError(err?.message ?? 'Failed to load datasets');
        setLoadingDatasets(false);
      });
  }, []);

  const handleSubmit = async () => {
    if (!datasourceId || !vizType) return;

    setCreating(true);
    setError(null);

    try {
      const parsedMetrics = metrics
        .split(',')
        .map(m => m.trim())
        .filter(Boolean);
      const parsedGroupby = groupby
        .split(',')
        .map(g => g.trim())
        .filter(Boolean);

      const selectedDataset = datasets.find(d => d.id === Number(datasourceId));

      await api.post('/chart/', {
        slice_name: sliceName || selectedDataset?.table_name || 'Untitled',
        viz_type: vizType,
        datasource_id: Number(datasourceId),
        datasource_type: 'table',
        params: {
          metrics: parsedMetrics,
          groupby: parsedGroupby,
          viz_type: vizType,
        },
      });

      navigate('/chart/list');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? err?.message ?? 'Failed to create chart');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box sx={{ p: 3, height: '100%' }}>
      <PageHeader title="Explore" subtitle="Create a new chart" />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 3, height: 'calc(100% - 80px)' }}>
        <Paper sx={{ width: '35%', p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          <FormControl fullWidth>
            <InputLabel id="datasource-label">Datasource</InputLabel>
            <Select
              labelId="datasource-label"
              value={datasourceId}
              label="Datasource"
              onChange={e => setDatasourceId(e.target.value)}
              disabled={loadingDatasets}
            >
              {loadingDatasets ? (
                <MenuItem disabled>Loading...</MenuItem>
              ) : (
                datasets.map(ds => (
                  <MenuItem key={ds.id} value={ds.id}>
                    {ds.table_name}
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel id="chart-type-label">Chart Type</InputLabel>
            <Select
              labelId="chart-type-label"
              value={vizType}
              label="Chart Type"
              onChange={e => setVizType(e.target.value)}
            >
              {CHART_TYPES.map(ct => (
                <MenuItem key={ct} value={ct}>
                  {ct.replace(/_/g, ' ')}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label="Slice Name"
            value={sliceName}
            onChange={e => setSliceName(e.target.value)}
          />

          <TextField
            fullWidth
            label="Metrics (comma-separated)"
            value={metrics}
            onChange={e => setMetrics(e.target.value)}
            helperText="e.g. count, sum(sales)"
          />

          <TextField
            fullWidth
            label="Group By (comma-separated)"
            value={groupby}
            onChange={e => setGroupby(e.target.value)}
            helperText="e.g. category, region"
          />

          <Button
            variant="contained"
            size="large"
            onClick={handleSubmit}
            disabled={creating || !datasourceId || !vizType}
            sx={{ mt: 1 }}
          >
            {creating ? <CircularProgress size={24} /> : 'Create Chart'}
          </Button>
        </Paper>

        <Paper sx={{ width: '65%', p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="h6">Data Preview</Typography>

          {datasourceId && (
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                label={datasets.find(d => d.id === Number(datasourceId))?.table_name ?? 'Unknown'}
                color="primary"
                variant="outlined"
              />
              {vizType && <Chip label={vizType.replace(/_/g, ' ')} color="secondary" variant="outlined" />}
            </Box>
          )}

          <TableContainer sx={{ flex: 1, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Column</TableCell>
                  <TableCell>Type</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell colSpan={2} align="center">
                    <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>
                      Select a datasource and configure your chart to see a preview
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>
    </Box>
  );
}

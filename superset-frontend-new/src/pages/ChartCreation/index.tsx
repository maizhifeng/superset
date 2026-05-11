import { useSearchParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import PageHeader from '@/components/PageHeader';
import ChartEditor from './ChartEditor';

export default function ChartCreation() {
  const [searchParams] = useSearchParams();
  const sliceId = searchParams.get('slice_id');
  const isEditing = Boolean(sliceId);

  return (
    <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <PageHeader title="Explore" subtitle={isEditing ? 'Edit chart' : 'Create a new chart'} />
      <ChartEditor />
    </Box>
  );
}

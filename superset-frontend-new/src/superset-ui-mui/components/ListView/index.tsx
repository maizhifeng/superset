import { forwardRef, type ReactNode } from 'react';
import List from '@mui/material/List';
import ListSubheader from '@mui/material/ListSubheader';
import CircularProgress from '@mui/material/CircularProgress';
import Box from '@mui/material/Box';

export interface ListViewProps<T = unknown> {
  dataSource: T[];
  renderItem: (item: T, index: number) => ReactNode;
  loading?: boolean;
  header?: ReactNode;
}

function ListViewInner<T>(
  props: ListViewProps<T>,
  ref: React.ForwardedRef<HTMLUListElement>,
) {
  const { dataSource, renderItem, loading, header } = props;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <List
      ref={ref}
      subheader={header ? <ListSubheader>{header}</ListSubheader> : undefined}
    >
      {dataSource.map((item, index) => renderItem(item, index))}
    </List>
  );
}

const SupersetListView = forwardRef(ListViewInner) as <T>(
  props: ListViewProps<T> & { ref?: React.Ref<HTMLUListElement> },
) => React.ReactElement;

export default SupersetListView;

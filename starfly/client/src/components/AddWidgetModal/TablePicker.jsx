import React from 'react';
import { Box, Typography, Drawer, Divider } from '@mui/material';
import { Icon } from '@/components/ui/icon';

const WIDTH = 280;

export default function TablePicker({ open, tables, groupedMetrics, onSelect, onClose, zIndex = 1302 }) {
  const tableItems = tables.filter(t => t.type === 'table');
  const datasetItems = tables.filter(t => t.type === 'dataset');

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{ zIndex }}
      slotProps={{
        paper: {
          sx: {
            width: WIDTH,
          },
        },
        modal: {
          keepMounted: true,
        },
      }}
    >
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>选择数据源</Typography>
      </Box>
      
      <Box sx={{ py: 1, overflowY: 'auto', flex: 1 }}>
        {tables.length === 0 ? (
          <Box sx={{ px: 2, py: 3, textAlign: 'center', color: 'text.secondary' }}>
            <Icon name="database" size={32} sx={{ color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2">暂无数据源</Typography>
          </Box>
        ) : (
          <>
            {datasetItems.length > 0 && (
              <>
                <Typography variant="caption" sx={{ px: 2, py: 0.5, display: 'block', color: 'primary.main', fontWeight: 600 }}>
                  数据集
                </Typography>
                {datasetItems.map(item => (
                  <Box
                    key={`ds:${item.name}`}
                    component="button"
                    type="button"
                    onClick={() => { onSelect(item.name); onClose(); }}
                    sx={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 2,
                      py: 1.25,
                      border: 'none',
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      cursor: 'pointer',
                      bgcolor: 'background.paper',
                      color: 'inherit',
                      textAlign: 'left',
                      '&:hover': { bgcolor: 'action.hover' },
                      '&:last-of-type': { borderBottom: 'none' },
                    }}
                  >
                    <Box sx={{ width: 36, height: 36, bgcolor: 'warning.light', borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="layerGroup" size={16} sx={{ color: 'warning.main' }} />
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{item.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {groupedMetrics[item.name]?.length || 0} 个指标 · {item.baseTable}
                      </Typography>
                    </Box>
                  </Box>
                ))}
                {tableItems.length > 0 && <Divider sx={{ my: 0.5 }} />}
              </>
            )}
            {tableItems.length > 0 && (
              <>
                <Typography variant="caption" sx={{ px: 2, py: 0.5, display: 'block', color: 'text.secondary', fontWeight: 600 }}>
                  数据库表
                </Typography>
                {tableItems.map(item => (
                  <Box
                    key={`tbl:${item.name}`}
                    component="button"
                    type="button"
                    onClick={() => { onSelect(item.name); onClose(); }}
                    sx={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 2,
                      py: 1.25,
                      border: 'none',
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      cursor: 'pointer',
                      bgcolor: 'background.paper',
                      color: 'inherit',
                      textAlign: 'left',
                      '&:hover': { bgcolor: 'action.hover' },
                      '&:last-of-type': { borderBottom: 'none' },
                    }}
                  >
                    <Box sx={{ width: 36, height: 36, bgcolor: 'primary.light', borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="database" size={16} sx={{ color: 'primary.main' }} />
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{item.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {groupedMetrics[item.name]?.length || 0} 个指标
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </>
            )}
          </>
        )}
      </Box>
    </Drawer>
  );
}

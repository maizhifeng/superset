import React from 'react';
import { Box, Typography, Drawer } from '@mui/material';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';

const WIDTH = 320;

export default function MetricPicker({ open, metrics, selectedIds, onToggle, onClose, zIndex = 1302 }) {
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
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>选择指标</Typography>
        <Typography variant="caption" color="text.secondary">已选 {selectedIds.length} 个</Typography>
      </Box>
      
      <Box sx={{ py: 1, overflowY: 'auto', flex: 1 }}>
        {metrics.length === 0 ? (
          <Box sx={{ px: 2, py: 3, textAlign: 'center', color: 'text.secondary' }}>
            <Icon name="barChart3" size={32} sx={{ color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2">此数据源暂无指标</Typography>
            <Typography variant="caption">请先创建指标</Typography>
          </Box>
        ) : (
          metrics.map(m => {
            const isSelected = selectedIds.includes(String(m.id));
            return (
              <Box
                key={m.id}
                component="button"
                type="button"
                onClick={() => onToggle(m.id)}
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
                  bgcolor: isSelected ? 'primary.50' : 'background.paper',
                  color: 'inherit',
                  textAlign: 'left',
                  '&:hover': { bgcolor: isSelected ? 'primary.100' : 'action.hover' },
                  '&:last-of-type': { borderBottom: 'none' },
                }}
              >
                <Box sx={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid', borderColor: isSelected ? 'primary.main' : 'divider', bgcolor: isSelected ? 'primary.main' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isSelected && <Box sx={{ width: 8, height: 8, bgcolor: 'primary.contrastText', borderRadius: '50%' }} />}
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{m.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{m.description || m.config?.table}</Typography>
                </Box>
              </Box>
            );
          })
        )}
      </Box>
      
      <Box sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
        <Button size="sm" onClick={onClose}>确认</Button>
      </Box>
    </Drawer>
  );
}
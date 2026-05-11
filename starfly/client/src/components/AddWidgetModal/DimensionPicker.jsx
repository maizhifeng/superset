import React from 'react';
import { Box, Typography, Drawer } from '@mui/material';
import { Icon } from '@/components/ui/icon';
import { Button } from '@/components/ui/button';

const WIDTH = 280;

export default function DimensionPicker({ open, columns, selectedDimensions, onToggle, onClose, zIndex = 1302 }) {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={() => { document.activeElement?.blur(); onClose?.(); }}
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
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>选择分组维度</Typography>
        <Typography variant="caption" color="text.secondary">
          已选 {selectedDimensions.filter(Boolean).length} 个
        </Typography>
      </Box>
      
      <Box sx={{ py: 1, overflowY: 'auto', flex: 1 }}>
        {columns.length === 0 ? (
          <Box sx={{ px: 2, py: 3, textAlign: 'center', color: 'text.secondary' }}>
            <Icon name="layerGroup" size={32} sx={{ color: 'text.disabled', mb: 1 }} />
            <Typography variant="body2">暂无可分组字段</Typography>
            <Typography variant="caption">数值字段不能用于分组</Typography>
          </Box>
        ) : (
          columns.map(c => {
            const isSelected = selectedDimensions.includes(c.column_name);
            return (
              <Box
                key={c.column_name}
                component="button"
                type="button"
                onClick={() => onToggle(c.column_name)}
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
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>{c.column_name}</Typography>
                  <Typography variant="caption" color="text.secondary">{c.data_type}</Typography>
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
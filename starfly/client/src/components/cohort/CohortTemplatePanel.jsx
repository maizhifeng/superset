import React, { useState, useEffect } from 'react';
import Drawer from '@mui/material/Drawer';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import Alert from '@mui/material/Alert';
import Snackbar from '@mui/material/Snackbar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCohortStore } from '../../store/cohortStore';
import { cohortAPI } from '../../api/cohortAPI';
import { queryKeys } from '../../api/queryKeys';

const METRIC_NAMES = {
  retention_rate: '留存率',
  ltv: 'LTV',
  ltv_multiplier: 'LTV倍率',
};

export default function CohortTemplatePanel({ open, onClose }) {
  const queryClient = useQueryClient();
  const config = useCohortStore((s) => s.config);
  const setConfig = useCohortStore((s) => s.setConfig);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' });

  const openSaveDialog = () => {
    setTemplateName(METRIC_NAMES[config.metric] || '');
    setSaveDialogOpen(true);
  };

  const { data: templatesData } = useQuery({
    queryKey: queryKeys.cohortTemplates(),
    queryFn: () => cohortAPI.getTemplates(),
    staleTime: 0,
  });
  const templates = templatesData?.data || [];

  const loadTemplate = (tpl) => {
    setConfig(tpl.config);
    if (tpl.config.dateRange) {
      setConfig({ dateRange: tpl.config.dateRange });
    }
    onClose();
    setSnackbar({ open: true, message: `已加载模板: ${tpl.name}`, severity: 'success' });
  };

  const saveMutation = useMutation({
    mutationFn: (data) => cohortAPI.saveTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cohortTemplates() });
      setSaveDialogOpen(false);
      setTemplateName('');
      setSnackbar({ open: true, message: '模板已保存', severity: 'success' });
    },
    onError: (err) => {
      setSnackbar({ open: true, message: `保存失败: ${err.message}`, severity: 'error' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => cohortAPI.deleteTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cohortTemplates() });
      setSnackbar({ open: true, message: '模板已删除', severity: 'success' });
    },
  });

  const handleSave = () => {
    if (!templateName.trim()) return;
    saveMutation.mutate({
      name: templateName.trim(),
        config: {
          userTable: config.userTable,
          activityTable: config.activityTable,
          cohortDateField: config.cohortDateField,
          cohortPeriod: config.cohortPeriod,
          metric: config.metric,
          firstXDays: config.firstXDays,
          dateRange: config.dateRange,
          dimensions: config.dimensions,
        },
    });
  };

  return (
    <>
      <Drawer anchor="right" open={open} onClose={onClose}>
        <Box sx={{ width: 350, p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" fontWeight={600} sx={{ flexGrow: 1 }}>
              模板管理
            </Typography>
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>

          <Button
            variant="contained"
            fullWidth
            onClick={openSaveDialog}
            sx={{ mb: 2 }}
          >
            保存当前配置
          </Button>

          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
            预设模板
          </Typography>
          <List dense>
            {templates.filter(t => t.is_preset).map((tpl) => (
              <ListItem key={tpl.id} disablePadding>
                <ListItemButton onClick={() => loadTemplate(tpl)}>
                  <ListItemText
                    primary={tpl.name}
                    secondary={tpl.description}
                    slotProps={{
                      primary: { fontSize: '0.875rem', fontWeight: 500 },
                      secondary: { fontSize: '0.75rem' },
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>

          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, mt: 2 }}>
            我的模板
          </Typography>
          <List dense>
            {templates.filter(t => !t.is_preset).map((tpl) => (
              <ListItem key={tpl.id} disablePadding secondaryAction={
                <IconButton edge="end" size="small" onClick={() => deleteMutation.mutate(tpl.id)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              }>
                <ListItemButton onClick={() => loadTemplate(tpl)}>
                  <ListItemText
                    primary={tpl.name}
                    slotProps={{
                      primary: { fontSize: '0.875rem' },
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
            {templates.filter(t => !t.is_preset).length === 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ px: 2 }}>
                暂无保存的模板
              </Typography>
            )}
          </List>
        </Box>
      </Drawer>

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>保存模板</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="模板名称"
            fullWidth
            size="small"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSaveDialogOpen(false)}>取消</Button>
          <Button onClick={handleSave} variant="contained" disabled={!templateName.trim()}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} variant="filled">
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}

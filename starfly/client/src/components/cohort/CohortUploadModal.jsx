import React, { useState, useCallback } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Alert from '@mui/material/Alert';
import LinearProgress from '@mui/material/LinearProgress';
import { useMutation } from '@tanstack/react-query';
import { useCohortStore } from '../../store/cohortStore';
import { cohortAPI } from '../../api/cohortAPI';

export default function CohortUploadModal({ open, onClose }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const setConfig = useCohortStore((s) => s.setConfig);

  const uploadMutation = useMutation({
    mutationFn: (data) => cohortAPI.upload(data),
    onSuccess: (res) => {
      if (res?.data) {
        setConfig({
          userTable: res.data.tableName,
          activityTable: 'user_daily_activity',
        });
        onClose();
        setFile(null);
        setPreview(null);
      }
    },
  });

  const handleFileChange = useCallback((e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const lines = text.split('\n').filter(l => l.trim());
      const headers = lines[0]?.split(',').map(h => h.trim()) || [];
      const rows = lines.slice(1, 6).map(l => l.split(',').map(v => v.trim()));
      setPreview({ headers, rows });
    };
    reader.readAsText(f);
  }, []);

  const handleUpload = () => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target.result;
      const csvBase64 = btoa(unescape(encodeURIComponent(text)));
      const lines = text.split('\n').filter(l => l.trim());
      const headers = lines[0]?.split(',').map(h => h.trim().replace(/[^a-zA-Z0-9_]/g, '')) || [];

      uploadMutation.mutate({
        csv: csvBase64,
        tableName: file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_'),
        columns: headers,
      });
    };
    reader.readAsText(file);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>上传CSV数据</DialogTitle>
      <DialogContent>
        <Box
          sx={{
            border: '2px dashed',
            borderColor: file ? 'primary.main' : 'divider',
            borderRadius: 2,
            p: 4,
            textAlign: 'center',
            cursor: 'pointer',
            mb: 2,
            '&:hover': { borderColor: 'primary.light' },
          }}
          onClick={() => document.getElementById('csv-upload-input').click()}
        >
          <input
            id="csv-upload-input"
            type="file"
            accept=".csv"
            hidden
            onChange={handleFileChange}
          />
          {file ? (
            <Typography>{file.name}</Typography>
          ) : (
            <Typography color="text.secondary">
              点击或拖拽CSV文件到此处
            </Typography>
          )}
        </Box>

        {preview && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>预览 (前5行)</Typography>
            <Box sx={{ overflow: 'auto', fontSize: '0.75rem' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>
                    {preview.headers.map((h, i) => (
                      <th key={i} style={{ border: '1px solid #e0e0e0', padding: '4px 8px', background: '#f5f5f5', textAlign: 'left' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row, ri) => (
                    <tr key={ri}>
                      {preview.headers.map((h, ci) => (
                        <td key={ci} style={{ border: '1px solid #e0e0e0', padding: '4px 8px' }}>
                          {row[ci] || ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Box>
          </Box>
        )}

        {uploadMutation.isPending && <LinearProgress sx={{ mt: 2 }} />}
        {uploadMutation.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            上传失败: {uploadMutation.error.message}
          </Alert>
        )}
        {uploadMutation.isSuccess && (
          <Alert severity="success" sx={{ mt: 2 }}>
            上传成功！表名: {uploadMutation.data?.data?.tableName}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button
          variant="contained"
          disabled={!file || uploadMutation.isPending}
          onClick={handleUpload}
        >
          上传
        </Button>
      </DialogActions>
    </Dialog>
  );
}

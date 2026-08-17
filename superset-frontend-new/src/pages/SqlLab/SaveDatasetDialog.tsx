import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Divider from "@mui/material/Divider";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";

interface SaveDatasetDialogProps {
  open: boolean;
  datasetName: string;
  saving: boolean;
  saveError: string | null;
  saveSuccess: boolean;
  savedDatasetId: number | null;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onOpenCreated?: (id: number) => void;
  onCreateChart?: (id: number) => void;
  onClose: () => void;
}

export default function SaveDatasetDialog({
  open,
  datasetName,
  saving,
  saveError,
  saveSuccess,
  savedDatasetId,
  onNameChange,
  onSave,
  onOpenCreated,
  onCreateChart,
  onClose,
}: SaveDatasetDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>保存为数据集</DialogTitle>
      <Divider />
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          {saveSuccess && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <Typography color="success.main" variant="body2">
                数据集保存成功
              </Typography>
              {savedDatasetId && (
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                  {onOpenCreated && (
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => onOpenCreated(savedDatasetId)}
                    >
                      在编辑器中打开
                    </Button>
                  )}
                  {onCreateChart && (
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => onCreateChart(savedDatasetId)}
                    >
                      基于它创建图表
                    </Button>
                  )}
                </Box>
              )}
            </Box>
          )}
          {saveError && (
            <Typography color="error" variant="body2">
              {saveError}
            </Typography>
          )}
          <TextField
            label="数据集名称"
            value={datasetName}
            onChange={(e) => onNameChange(e.target.value)}
            fullWidth
            autoFocus
            disabled={saving}
            helperText="从当前 SQL 创建虚拟数据集"
          />
        </Box>
      </DialogContent>
      <Divider />
      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={saving}>
          {saveSuccess ? "关闭" : "取消"}
        </Button>
        <Button
          variant="contained"
          onClick={onSave}
          disabled={saving || !datasetName.trim()}
        >
          {saving ? <CircularProgress size={20} /> : "保存"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

import { useState, useEffect, useMemo } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import BarChartIcon from "@mui/icons-material/BarChart";
import api from "@/api";
import { parseErrorMessage } from "@/utils/parseErrorMessage";

interface AddChartDialogProps {
  open: boolean;
  excludeIds: Set<number>;
  onSelect: (chart: {
    id: number;
    slice_name: string;
    viz_type: string;
  }) => void;
  onClose: () => void;
}

interface ChartOption {
  id: number;
  slice_name: string;
  viz_type: string;
}

export default function AddChartDialog({
  open,
  excludeIds,
  onSelect,
  onClose,
}: AddChartDialogProps) {
  const [charts, setCharts] = useState<ChartOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setSearch("");
    setSelectedId(null);
    api
      .get<{ result: ChartOption[] }>("/chart/?q=(page_size:500,page:0)")
      .then((res) => {
        setCharts(res.data.result || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(parseErrorMessage(err, "Failed to load charts"));
        setLoading(false);
      });
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return charts.filter((c) => {
      if (excludeIds.has(c.id)) return false;
      if (!q) return true;
      return (
        c.slice_name.toLowerCase().includes(q) ||
        c.viz_type.toLowerCase().includes(q) ||
        String(c.id).includes(q)
      );
    });
  }, [charts, excludeIds, search]);

  const handleConfirm = () => {
    if (selectedId != null) {
      const chart = charts.find((c) => c.id === selectedId);
      if (chart) {
        onSelect(chart);
        onClose();
      }
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Chart to Dashboard</DialogTitle>
      <DialogContent sx={{ minHeight: 300 }}>
        <TextField
          autoFocus
          fullWidth
          size="small"
          placeholder="Search charts..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedId(null);
          }}
          sx={{ mb: 2, mt: 1 }}
        />
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {!loading && !error && filtered.length === 0 && (
          <Box sx={{ textAlign: "center", py: 4, color: "text.secondary" }}>
            {search
              ? "No charts match your search"
              : "No charts available to add"}
          </Box>
        )}
        <List dense sx={{ maxHeight: 360, overflow: "auto" }}>
          {filtered.map((chart) => (
            <ListItemButton
              key={chart.id}
              selected={selectedId === chart.id}
              onClick={() => setSelectedId(chart.id)}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <BarChartIcon
                  fontSize="small"
                  color={selectedId === chart.id ? "primary" : "inherit"}
                />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Typography variant="body2" noWrap>
                    {chart.slice_name}
                  </Typography>
                }
              />
              <Chip
                label={chart.viz_type}
                size="small"
                variant="outlined"
                sx={{ fontSize: "0.65rem", height: 20 }}
              />
            </ListItemButton>
          ))}
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={selectedId == null}
        >
          Add Chart
        </Button>
      </DialogActions>
    </Dialog>
  );
}

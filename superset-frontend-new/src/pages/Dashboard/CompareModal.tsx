import { useState, useEffect, useCallback, useMemo } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import Chip from "@mui/material/Chip";
import CloseIcon from "@mui/icons-material/Close";
import FlipIcon from "@mui/icons-material/Flip";
import dayjs from "dayjs";
import api from "@/api";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import type { QueryResult } from "@/types/api";

interface GameOption {
  papp_id: string;
  papp_name: string;
  上线时间: string;
}

interface SelectedGame extends GameOption {
  dateRange: { start: string; end: string };
}

const PERIODS = [
  { label: "上线后 7 天", days: 7 },
  { label: "上线后 14 天", days: 14 },
  { label: "上线后 30 天", days: 30 },
  { label: "上线后 60 天", days: 60 },
  { label: "上线后 90 天", days: 90 },
];

interface CompareModalProps {
  open: boolean;
  onClose: () => void;
  chartData?: Record<string, unknown>;
}

export default function CompareModal({ open, onClose, chartData }: CompareModalProps) {
  const [games, setGames] = useState<GameOption[]>([]);
  const [selectedGames, setSelectedGames] = useState<SelectedGame[]>([]);
  const [periodDays, setPeriodDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    api
      .get<{ result: { papp_id: number; papp_name: string; 上线时间: string }[] }>(
        "/project/papp",
      )
      .then((res) => {
        const list = (res.data.result ?? []).map((r) => ({
          papp_id: String(r.papp_id),
          papp_name: r.papp_name ?? "",
          上线时间: r.上线时间 ?? "",
        }));
        setGames(list.filter((g) => g.上线时间));
      })
      .catch((err) => setError(parseErrorMessage(err, "Failed to load games")))
      .finally(() => setLoading(false));
  }, [open]);

  const gameOptions = useMemo(
    () =>
      games.filter(
        (g) => !selectedGames.some((sg) => sg.papp_id === g.papp_id),
      ),
    [games, selectedGames],
  );

  const removeGame = useCallback((pappId: string) => {
    setSelectedGames((prev) => prev.filter((g) => g.papp_id !== pappId));
  }, []);

  useEffect(() => {
    setSelectedGames((prev) =>
      prev.map((g) => {
        if (!g.上线时间) return g;
        const start = dayjs(g.上线时间);
        if (!start.isValid()) return g;
        return {
          ...g,
          dateRange: {
            start: start.format("YYYY-MM-DD"),
            end: start.add(periodDays, "day").format("YYYY-MM-DD"),
          },
        };
      }),
    );
  }, [periodDays]);

  const handleQuery = useCallback(async () => {
    if (selectedGames.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const rows: Record<string, string>[] = [];
      for (const game of selectedGames) {
        rows.push({
          papp_id: game.papp_id,
          papp_name: game.papp_name,
          上线时间: game.上线时间,
          对比周期: `${game.dateRange.start} ~ ${game.dateRange.end}`,
          上线天数: String(periodDays),
        });
      }
      setQueryResult({
        status: "success",
        columns: [
          { name: "papp_id", type: "VARCHAR" },
          { name: "papp_name", type: "VARCHAR" },
          { name: "上线时间", type: "VARCHAR" },
          { name: "对比周期", type: "VARCHAR" },
          { name: "上线天数", type: "VARCHAR" },
        ],
        data: rows as unknown as Record<string, unknown>[],
      });
    } catch (err: unknown) {
      setError(parseErrorMessage(err, "Query failed"));
    } finally {
      setLoading(false);
    }
  }, [selectedGames, periodDays]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xl"
      fullWidth
      slotProps={{
        backdrop: {
          sx: {
            backdropFilter: "blur(4px)",
            backgroundColor: "rgba(0, 0, 0, 0.4)",
          },
        },
        paper: {
          sx: {
            borderRadius: 3,
            height: "85vh",
            boxShadow: "0 8px 40px rgba(0, 0, 0, 0.24)",
          },
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          bgcolor: "grey.50",
          borderBottom: "1px solid",
          borderColor: "divider",
          px: 3,
          py: 1.5,
        }}
      >
        <FlipIcon sx={{ fontSize: 22, color: "primary.main" }} />
        <Typography variant="h6" sx={{ fontWeight: 600, flex: 1 }}>
          Period Comparison
        </Typography>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          {PERIODS.map((p) => (
            <Chip
              key={p.days}
              label={p.label}
              size="small"
              variant={periodDays === p.days ? "filled" : "outlined"}
              color={periodDays === p.days ? "primary" : "default"}
              onClick={() => setPeriodDays(p.days)}
              sx={{ cursor: "pointer" }}
            />
          ))}
        </Box>
        <Button
          variant="contained"
          size="small"
          onClick={handleQuery}
          disabled={selectedGames.length === 0 || loading}
          sx={{ ml: 1 }}
        >
          {loading ? "..." : "Query"}
        </Button>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, p: 3, pt: "12px !important" }}>
        <Autocomplete
          multiple
          value={selectedGames}
          inputValue={inputValue}
          onInputChange={(_, v) => setInputValue(v)}
          options={gameOptions}
          getOptionLabel={(o) => `${o.papp_name} (${o.papp_id})`}
          onChange={(_, value) => {
            setSelectedGames(
              value.map((g: GameOption | SelectedGame) => {
                if ("dateRange" in g && g.dateRange) return g as SelectedGame;
                const sg = g as GameOption;
                const start = dayjs(sg.上线时间);
                if (!start.isValid()) return sg as unknown as SelectedGame;
                return {
                  ...sg,
                  dateRange: {
                    start: start.format("YYYY-MM-DD"),
                    end: start.add(periodDays, "day").format("YYYY-MM-DD"),
                  },
                } as SelectedGame;
              }),
            );
          }}
          filterSelectedOptions
          disableCloseOnSelect
          openOnFocus
          autoHighlight
          noOptionsText="No matches"
          sx={{
            maxWidth: 400,
            "& .MuiInputBase-root": { minHeight: 36 },
            "& .MuiInputBase-input": {
              py: 0.5,
              fontSize: "0.8125rem",
              minWidth: 60,
            },
          }}
          slotProps={{
            chip: { size: "small", sx: { height: 20 } },
            popper: {
              sx: {
                "& .MuiAutocomplete-listbox .MuiAutocomplete-option": {
                  minHeight: 28,
                  fontSize: "0.8125rem",
                },
                "& .MuiPaper-root": {
                  border: "1px solid",
                  borderColor: "divider",
                },
              },
            },
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Select games to compare"
              placeholder={selectedGames.length > 0 ? "" : "Search by game name or ID"}
              size="small"
            />
          )}
        />

        {selectedGames.length > 0 && (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {selectedGames.map((g) => (
              <Chip
                key={g.papp_id}
                label={`${g.papp_name} (${g.dateRange.start} ~ ${g.dateRange.end})`}
                onDelete={() => removeGame(g.papp_id)}
                size="small"
                color="primary"
                variant="outlined"
              />
            ))}
          </Box>
        )}

        {error && (
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        )}

        {queryResult && (
          <Box
            sx={{
              flex: 1,
              overflow: "auto",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
            }}
          >
            <Box
              component="table"
              sx={{
                width: "100%",
                borderCollapse: "collapse",
                "& th, & td": {
                  border: "1px solid",
                  borderColor: "divider",
                  px: 1.5,
                  py: 1,
                  textAlign: "center",
                  fontSize: "0.8125rem",
                },
                "& th": {
                  bgcolor: "grey.50",
                  fontWeight: 700,
                  fontSize: "0.75rem",
                  position: "sticky",
                  top: 0,
                  zIndex: 1,
                },
              }}
            >
              <thead>
                <tr>
                  {queryResult.columns.map((col) => (
                    <th key={col.name}>{col.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queryResult.data.map((row, i) => (
                  <tr key={i}>
                    {queryResult.columns.map((col) => (
                      <td key={col.name}>{String(row[col.name] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Box>
          </Box>
        )}

        {!queryResult && selectedGames.length > 0 && (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Select games and click "Query" to see comparison data
            </Typography>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

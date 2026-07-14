import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import AutoAwesome from "@mui/icons-material/AutoAwesome";
import PlayArrowIcon from "@mui/icons-material/PlayArrow"
import type { DrillDownSuggestion } from "@/types/ai";

interface SuggestionListProps {
  suggestions: DrillDownSuggestion[];
  disabled: boolean;
  onSelect: (suggestion: DrillDownSuggestion) => void;
}

export default function SuggestionList({ suggestions, disabled, onSelect }: SuggestionListProps) {
  if (suggestions.length === 0) return null;

  return (
    <List dense disablePadding>
      {suggestions.map((s, i) => (
        <ListItemButton
          key={s.id}
          divider={i < suggestions.length - 1}
          disabled={disabled}
          onClick={() => onSelect(s)}
          sx={{ py: 1, px: 1.5 }}
        >
          <AutoAwesome sx={{ fontSize: 18, color: "primary.main", mr: 1 }} />
          <ListItemText primary={s.label} />
          <PlayArrowIcon sx={{ fontSize: 16, color: "action.active", ml: 1 }} />
        </ListItemButton>
      ))}
    </List>
  );
}

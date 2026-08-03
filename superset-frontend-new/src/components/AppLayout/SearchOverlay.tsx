import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import Box from "@mui/material/Box";
import ChatInput from "@/components/ChatInput";
import SearchExamples from "@/components/SearchExamples";

interface SearchOverlayProps {
  open: boolean;
  query: string;
  onClose: () => void;
  onQueryChange: (q: string) => void;
}

export default function SearchOverlay({
  open,
  query,
  onClose,
  onQueryChange,
}: SearchOverlayProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: {
          sx: {
            position: "fixed",
            top: "20vh",
            m: 0,
            borderRadius: 2,
            width: "90%",
            maxWidth: 520,
          },
        },
        backdrop: { sx: { bgcolor: "var(--mui-palette-shadow-backdrop)" } },
      }}
    >
      <DialogContent sx={{ p: 2, pt: 2.5 }} onClick={onClose}>
        <Box onClick={(e) => e.stopPropagation()}>
          <ChatInput
            autoFocus
            placeholder="询问关于数据的问题..."
            disableMaxWidth
            value={query}
            onChange={onQueryChange}
          />
          <SearchExamples onSelect={(q) => onQueryChange(q)} />
        </Box>
      </DialogContent>
    </Dialog>
  );
}

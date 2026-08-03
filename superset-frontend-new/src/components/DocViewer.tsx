import { useMemo } from "react";
import Box from "@mui/material/Box";
import LightMdRenderer from "@/components/LightMdRenderer";
import { docs } from "./docCatalog";

interface DocViewerProps {
  docKey: string;
}

export default function DocViewer({ docKey }: DocViewerProps) {
  const doc = useMemo(() => docs[docKey], [docKey]);

  if (!doc) return null;

  return (
    <Box
      sx={{
        flex: 1,
        overflow: "auto",
        p: 2,
        bgcolor: "background.paper",
      }}
    >
      <LightMdRenderer content={doc.content} />
    </Box>
  );
}

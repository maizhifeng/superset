import { Fragment } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";

interface LightMdRendererProps {
  content: string;
}

function processInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(
        <Box
          key={key++}
          component="code"
          sx={{
            bgcolor: "grey.100",
            px: 0.5,
            borderRadius: 0.5,
            fontSize: "0.8125rem",
            fontFamily: "monospace",
          }}
        >
          {codeMatch[1]}
        </Box>,
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      parts.push(
        <Link
          key={key++}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          sx={{ fontSize: "0.8125rem" }}
        >
          {linkMatch[1]}
        </Link>,
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      parts.push(
        <Box key={key++} component="strong" sx={{ fontWeight: 700 }}>
          {boldMatch[1]}
        </Box>,
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const newlineMatch = remaining.match(/^\n/);
    if (newlineMatch) {
      parts.push(<Fragment key={key++}>{"\n"}</Fragment>);
      remaining = remaining.slice(1);
      continue;
    }

    parts.push(remaining[0]);
    remaining = remaining.slice(1);
  }

  return parts;
}

export default function LightMdRenderer({ content }: LightMdRendererProps) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <Box
          key={key++}
          sx={{
            borderLeft: "3px solid",
            borderColor: "primary.light",
            pl: 1.5,
            py: 0.5,
            my: 1,
            bgcolor: "action.hover",
            borderRadius: "0 8px 8px 0",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {processInline(quoteLines.join(" "))}
          </Typography>
        </Box>,
      );
      continue;
    }

    // Heading
    if (line.startsWith("### ")) {
      elements.push(
        <Typography
          key={key++}
          variant="subtitle2"
          sx={{ fontWeight: 600, mt: 1.5, mb: 0.5, fontSize: "0.875rem" }}
        >
          {processInline(line.slice(4))}
        </Typography>,
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <Typography
          key={key++}
          variant="subtitle1"
          sx={{
            fontWeight: 700,
            mt: 2,
            mb: 0.75,
            fontSize: "0.9375rem",
            color: "primary.main",
          }}
        >
          {processInline(line.slice(3))}
        </Typography>,
      );
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      elements.push(
        <Typography
          key={key++}
          variant="h6"
          sx={{ fontWeight: 700, mt: 2, mb: 1, fontSize: "1.125rem" }}
        >
          {processInline(line.slice(2))}
        </Typography>,
      );
      i++;
      continue;
    }

    // Unordered list
    if (line.match(/^[-*]\s/)) {
      const listItems: React.ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s/)) {
        listItems.push(
          <Box
            key={key++}
            sx={{ display: "flex", gap: 1, pl: 1, mb: 0.25 }}
          >
            <Typography variant="body2" color="text.disabled" sx={{ lineHeight: 1.6 }}>
              •
            </Typography>
            <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
              {processInline(lines[i].slice(2))}
            </Typography>
          </Box>,
        );
        i++;
      }
      elements.push(
        <Box key={key++} sx={{ mb: 0.5 }}>
          {listItems}
        </Box>,
      );
      continue;
    }

    // Regular paragraph
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].match(/^[-*]\s/) &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith("> ")
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }
    if (paragraphLines.length > 0) {
      elements.push(
        <Typography
          key={key++}
          variant="body2"
          sx={{ mb: 0.5, lineHeight: 1.7 }}
        >
          {processInline(paragraphLines.join("\n"))}
        </Typography>,
      );
    } else {
      i++;
    }
  }

  return <Box sx={{ "&:first-child": { mt: 0 } }}>{elements}</Box>;
}

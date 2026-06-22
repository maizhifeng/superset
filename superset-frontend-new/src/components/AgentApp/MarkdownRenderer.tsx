import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";

interface MarkdownRendererProps {
  content: string;
}

function sanitize(text: string): string {
  return text
    .replace(/<\|\\?"\|>}/g, "")
    .replace(/\\?"\|>\|?/g, "")
    .replace(/\|\\?"/g, "")
    .replace(/\\?"/g, "")
    .replace(/<\|/g, "")
    .replace(/\|>/g, "")
    .replace(/"\|>}/g, "");
}

function renderInline(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = [];
  let remaining = sanitize(text);

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    const codeMatch = remaining.match(/`(.+?)`/);
    const plainStarIdx = remaining.search(/(?<!\*)\*(?!\*)/);
    const italicMatch = plainStarIdx >= 0 ? remaining.slice(plainStarIdx).match(/^\*(.+?)\*/) : null;

    const boldIdx = boldMatch ? remaining.indexOf(boldMatch[0]) : -1;
    const codeIdx = codeMatch ? remaining.indexOf(codeMatch[0]) : -1;
    const italicIdx = italicMatch ? plainStarIdx : -1;

    const candidates = [
      { idx: boldIdx >= 0 ? boldIdx : Infinity, type: "bold" as const, match: boldMatch },
      { idx: codeIdx >= 0 ? codeIdx : Infinity, type: "code" as const, match: codeMatch },
      { idx: italicIdx >= 0 ? italicIdx : Infinity, type: "italic" as const, match: italicMatch },
    ].sort((a, b) => a.idx - b.idx);

    const first = candidates[0];
    if (first.idx === Infinity) {
      parts.push(remaining);
      break;
    }

    if (first.idx > 0) {
      parts.push(remaining.slice(0, first.idx));
    }

    if (first.type === "bold" && first.match) {
      parts.push(<strong key={parts.length}>{first.match[1]}</strong>);
      remaining = remaining.slice(first.idx + first.match[0].length);
    } else if (first.type === "code" && first.match) {
      parts.push(
        <Box
          key={parts.length}
          component="code"
          sx={{ bgcolor: "grey.200", px: 0.5, borderRadius: 0.5, fontSize: "0.85em" }}
        >
          {first.match[1]}
        </Box>,
      );
      remaining = remaining.slice(first.idx + first.match[0].length);
    } else if (first.type === "italic" && first.match) {
      parts.push(<em key={parts.length}>{first.match[1]}</em>);
      remaining = remaining.slice(first.idx + first.match[0].length);
    } else {
      parts.push(remaining);
      break;
    }
  }

  return parts;
}

function parseTableRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inCell = false;
  for (const ch of line) {
    if (ch === "|") {
      cells.push(current.trim());
      current = "";
      inCell = !inCell;
    } else {
      current += ch;
    }
  }
  if (current.trim()) cells.push(current.trim());
  return cells.filter((c) => c.length > 0);
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      elements.push(
        <Box
          key={key++}
          component="pre"
          sx={{
            bgcolor: "grey.900",
            color: "grey.100",
            p: 1.5,
            borderRadius: 1,
            overflow: "auto",
            fontSize: "0.8rem",
            lineHeight: 1.4,
            my: 1,
          }}
        >
          <Typography component="code" variant="caption" sx={{ color: "inherit", whiteSpace: "pre" }}>
            {codeLines.join("\n")}
          </Typography>
        </Box>,
      );
      continue;
    }

    if (trimmed.startsWith("|") && i + 1 < lines.length && lines[i + 1].trim().match(/^\|[\s:-]+\|/)) {
      const headerRow = sanitize(lines[i]);
      const dataRows: string[] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        dataRows.push(sanitize(lines[i]));
        i++;
      }

      const headers = parseTableRow(headerRow);
      const colCount = headers.length;
      const rows = dataRows.map((r) => {
        const cells = parseTableRow(r);
        if (cells.length > colCount) {
          const merged = cells.slice(0, colCount - 1);
          merged.push(cells.slice(colCount - 1).join(" "));
          return merged;
        }
        return cells;
      });

      elements.push(
        <TableContainer key={key++} component={Paper} variant="outlined" sx={{ my: 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                {headers.map((h, ci) => (
                  <TableCell key={ci} sx={{ fontWeight: 600 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, ri) => (
                <TableRow key={ri}>
                  {row.map((cell, ci) => (
                    <TableCell key={ci}>{cell}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>,
      );
      continue;
    }

    if (trimmed.startsWith("### ")) {
      elements.push(
        <Typography key={key++} variant="subtitle1" sx={{ fontWeight: 600, mt: 1.5, mb: 0.5 }}>
          {renderInline(trimmed.slice(4))}
        </Typography>,
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      elements.push(
        <Typography key={key++} variant="h6" sx={{ fontWeight: 700, mt: 2, mb: 0.5 }}>
          {renderInline(trimmed.slice(3))}
        </Typography>,
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("# ")) {
      elements.push(
        <Typography key={key++} variant="h5" sx={{ fontWeight: 700, mt: 2, mb: 0.5 }}>
          {renderInline(trimmed.slice(2))}
        </Typography>,
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith("- ") || lines[i].trim().startsWith("* "))) {
        items.push(lines[i].trim().slice(2));
        i++;
      }
      elements.push(
        <Box key={key++} component="ul" sx={{ m: 0, pl: 2, mb: 0.5 }}>
          {items.map((item, idx) => (
            <Typography key={idx} component="li" variant="body2" sx={{ mb: 0.25 }}>
              {renderInline(item)}
            </Typography>
          ))}
        </Box>,
      );
      continue;
    }

    if (trimmed.startsWith("---")) {
      elements.push(
        <Box key={key++} sx={{ borderTop: "1px solid", borderColor: "divider", my: 1 }} />,
      );
      i++;
      continue;
    }

    elements.push(
      <Typography key={key++} variant="body2" sx={{ mb: 0.5, lineHeight: 1.6 }}>
        {renderInline(trimmed)}
      </Typography>,
    );
    i++;
  }

  return <Box>{elements}</Box>;
}

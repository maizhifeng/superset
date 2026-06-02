import { Fragment, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";

interface LightMdRendererProps {
  content: string;
}

/**
 * Comprehensive LaTeX command → Unicode mapping.
 * Order matters: longer commands first to avoid partial matches.
 */
const LATEX_REPLACE: Record<string, string> = {
  // Greek letters
  "\\alpha": "α", "\\beta": "β", "\\gamma": "γ", "\\delta": "δ",
  "\\epsilon": "ε", "\\zeta": "ζ", "\\eta": "η", "\\theta": "θ",
  "\\iota": "ι", "\\kappa": "κ", "\\lambda": "λ", "\\mu": "μ",
  "\\nu": "ν", "\\xi": "ξ", "\\omicron": "ο", "\\pi": "π",
  "\\rho": "ρ", "\\sigma": "σ", "\\tau": "τ", "\\upsilon": "υ",
  "\\phi": "φ", "\\chi": "χ", "\\psi": "ψ", "\\omega": "ω",
  // Capital Greek
  "\\Gamma": "Γ", "\\Delta": "Δ", "\\Theta": "Θ", "\\Lambda": "Λ",
  "\\Xi": "Ξ", "\\Pi": "Π", "\\Sigma": "Σ", "\\Phi": "Φ",
  "\\Psi": "Ψ", "\\Omega": "Ω",
  // Arrows (longest first to avoid prefix matches)
  "\\longleftrightarrow": "↔", "\\longleftarrow": "⟵", "\\longrightarrow": "⟶",
  "\\Leftrightarrow": "⇔", "\\leftrightarrow": "↔",
  "\\Rightarrow": "⇒", "\\Leftarrow": "⇐",
  "\\rightarrow": "→", "\\leftarrow": "←",
  "\\downarrow": "↓", "\\uparrow": "↑",
  "\\updownarrow": "↕", "\\Downarrow": "⇓", "\\Uparrow": "⇑",
  "\\nearrow": "↗", "\\searrow": "↘",
  "\\swarrow": "↙", "\\nwarrow": "↖",
  "\\mapsto": "↦", "\\hookrightarrow": "↪", "\\hookleftarrow": "↩",
  "\\to": "→",
  // Relations
  "\\approx": "≈", "\\neq": "≠", "\\leq": "≤", "\\ge": "≥",
  "\\geq": "≥", "\\leqslant": "≤", "\\geqslant": "≥",
  "\\equiv": "≡", "\\sim": "∼", "\\simeq": "≃", "\\cong": "≅",
  "\\propto": "∝", "\\prec": "≺", "\\succ": "≻",
  "\\preceq": "⪯", "\\succeq": "⪰",
  "\\subset": "⊂", "\\supset": "⊃",
  "\\subseteq": "⊆", "\\supseteq": "⊇",
  "\\ll": "≪", "\\gg": "≫",
  // Operators
  "\\times": "×", "\\pm": "±", "\\mp": "∓",
  "\\cdot": "·", "\\div": "÷", "\\ast": "∗",
  "\\star": "⋆", "\\circ": "∘", "\\bullet": "•",
  "\\oplus": "⊕", "\\ominus": "⊖", "\\otimes": "⊗",
  "\\odot": "⊙", "\\sum": "∑", "\\prod": "∏",
  "\\coprod": "∐", "\\int": "∫", "\\oint": "∮",
  "\\nabla": "∇", "\\partial": "∂",
  // Set / Logic
  "\\emptyset": "∅", "\\varnothing": "∅",
  "\\forall": "∀", "\\exists": "∃", "\\nexists": "∄",
  "\\neg": "¬", "\\wedge": "∧", "\\vee": "∨",
  // Dots
  "\\dots": "…", "\\cdots": "⋯", "\\vdots": "⋮", "\\ddots": "⋱",
  // Misc
  "\\infty": "∞", "\\angle": "∠", "\\perp": "⊥",
  "\\triangle": "△", "\\square": "□",
  "\\degree": "°",
  // Escaped
  "\\%": "%",
};

/** Find matching close brace for brace at pos i in s */
function matchBrace(s: string, i: number): number {
  let depth = 1;
  let j = i + 1;
  while (j < s.length && depth > 0) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}") depth--;
    j++;
  }
  return j - 1;
}

/** Strip outer braces from a matched group */
function stripBraces(s: string): string {
  return s.replace(/^{\s*|\s*}$/g, "").replace(/\{|\}/g, "");
}

/** Strip \text{...} → ... */
function stripText(s: string): string {
  return s.replace(/\\text\s*\{([^}]*)\}/g, "$1");
}

/** Replace \frac with brace-matching (handles nested {...}) */
function resolveFrac(s: string): string {
  let result = "";
  let i = 0;
  while (i < s.length) {
    if (s.slice(i, i + 5) === "\\frac" && s[i + 5] === "{") {
      const numStart = i + 6;
      const numEnd = matchBrace(s, numStart - 1);
        const num = stripBraces(s.slice(numStart, numEnd));
      if (s[numEnd + 1] === "{") {
        const denStart = numEnd + 2;
        const denEnd = matchBrace(s, denStart - 1);
        const den = stripBraces(s.slice(denStart, denEnd));
        result += `${num}/${den}`;
        i = denEnd + 1;
        continue;
      }
    }
    result += s[i];
    i++;
  }
  return result;
}

function resolveLatex(text: string): string {
  let result = text;
  result = stripText(result);      // \text{...} → {...}
  result = resolveFrac(result);    // \frac{a}{b} → a/b
  for (const [cmd, char] of Object.entries(LATEX_REPLACE)) {
    result = result.replaceAll(cmd, char);
  }
  // Remove remaining single $ used as LaTeX delimiters
  result = result.replace(/\$/g, "");
  return result;
}

function processInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Inline LaTeX math $...$
    const latexMatch = remaining.match(/^\$([^$]+)\$/);
    if (latexMatch) {
      parts.push(<Fragment key={key++}>{resolveLatex(latexMatch[1])}</Fragment>);
      remaining = remaining.slice(latexMatch[0].length);
      continue;
    }

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

    // Table (| ... | syntax)
    if (line.startsWith("|") && line.endsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("|") && lines[i].endsWith("|")) {
        tableLines.push(lines[i].trim());
        i++;
      }
      if (tableLines.length >= 2) {
        const parseRow = (raw: string): ReactNode[] =>
          raw
            .split("|")
            .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
            .map((cell) => processInline(cell.trim()));

        const headerCells = parseRow(tableLines[0]);
        // tableLines[1] is the alignment separator (|---|); skip it
        const dataRows = tableLines.slice(2);

        elements.push(
            <Box
              key={key++}
              sx={{
                overflowX: "auto",
                my: 1,
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                transition: "opacity 0.15s ease",
              }}
          >
            <Table size="small" sx={{ borderCollapse: "collapse" }}>
              <TableHead>
                <TableRow>
                  {headerCells.map((cell, ci) => (
                    <TableCell
                      key={ci}
                      sx={{
                        fontWeight: 700,
                        fontSize: "0.75rem",
                        borderRight: ci < headerCells.length - 1 ? "1px solid" : "none",
                        borderColor: "divider",
                        bgcolor: "action.hover",
                        whiteSpace: "nowrap",
                        py: 0.75,
                        px: 1.5,
                      }}
                    >
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {dataRows.map((row, ri) => (
                  <TableRow
                    key={ri}
                    sx={{
                      bgcolor: ri % 2 === 1 ? "action.hover" : "transparent",
                    }}
                  >
                    {parseRow(row).map((cell, ci) => (
                      <TableCell
                        key={ci}
                        sx={{
                          fontSize: "0.75rem",
                          borderRight: ci < headerCells.length - 1 ? "1px solid" : "none",
                          borderColor: "divider",
                          whiteSpace: "nowrap",
                          py: 0.5,
                          px: 1.5,
                        }}
                      >
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>,
        );
      } else {
        // Fewer than 2 lines isn't a valid table; render as text
        elements.push(
          <Typography key={key++} variant="body2" sx={{ mb: 0.5, lineHeight: 1.7 }}>
            {tableLines.join("\n")}
          </Typography>,
        );
      }
      continue;
    }

    // Regular paragraph
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].match(/^[-*]\s/) &&
      !lines[i].startsWith("|") &&
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

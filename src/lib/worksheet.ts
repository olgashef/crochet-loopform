import { analyzeInstruction, readRoundLine } from "./pattern";

export function stripWrittenCount(text: string) {
  return text.replace(/\s*\(\d+\)\s*(?=\/\/|$)/, "");
}
export function worksheetInstruction(line: string) {
  const row = readRoundLine(line);
  if (!row) return "";
  const body = stripWrittenCount(row.instruction);
  if (row.end !== null && !/\bfor\s+\d+\s+(?:rounds?|rnds?)\b/i.test(body)) {
    const parts = body.split("//");
    return `${parts[0].trim()} for ${row.end - row.start + 1} rounds${parts.length > 1 ? " //" + parts.slice(1).join("//") : ""}`;
  }
  return body;
}
function duration(body: string) {
  const match = /\bfor\s+(\d+)\s+(?:rounds?|rnds?)\b/i.exec(body);
  return match ? Math.min(150, Math.max(1, Number(match[1]))) : 1;
}
/** Round labels are structural; editing a hold duration renumbers following rows. */
export function renumberWorksheet(lines: string[]) {
  let next = 1;
  return lines
    .map((line) => {
      const row = readRoundLine(line);
      if (!row) return line;
      const body = worksheetInstruction(line);
      const span = duration(body);
      const end = next + span - 1;
      const label = `Rnd ${next}${span > 1 ? "–" + end : ""}`;
      next = end + 1;
      return `${label}: ${body}`;
    })
    .join("\n");
}
export function editWorksheetRow(
  source: string,
  line: number,
  instruction: string,
) {
  const lines = source.split(/\r?\n/);
  lines[line - 1] =
    `Rnd 1: ${stripWrittenCount(instruction.replace(/\r?\n/g, " "))}`;
  return renumberWorksheet(lines);
}
export function insertWorksheetRow(source: string, afterLine: number) {
  const lines = source ? source.split(/\r?\n/) : [];
  lines.splice(afterLine, 0, "Rnd 1: ");
  return renumberWorksheet(lines);
}
export function deleteWorksheetRow(source: string, line: number) {
  const lines = source.split(/\r?\n/);
  lines.splice(line - 1, 1);
  return renumberWorksheet(lines);
}
export function pasteWorksheetRows(source: string, line: number, text: string) {
  if (text.length > 120000)
    throw new Error("Paste a pattern under 120,000 characters.");
  if (text.split("\n").filter((l) => l.trim()).length > 150)
    throw new Error("Paste at most 150 worksheet rows at a time.");
  const incoming = text
    .replace(/\r/g, "")
    .trim()
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const row =
        /^(?:(?:rnd|round|r)\.?\s*\d|\d+(?:\s*[-–]\s*\d+)?\s*:)/i.test(l.trim())
          ? readRoundLine(l)
          : null;
      return row
        ? `Rnd ${row.start}${row.end ? "–" + row.end : ""}: ${stripWrittenCount(row.instruction)}`
        : `Rnd 1: ${stripWrittenCount(l.trim())}`;
    });
  if (!incoming.length) return source;
  const lines = source.split(/\r?\n/);
  const first = readRoundLine(incoming[0] ?? "");
  if (incoming.length > 1 && first?.start === 1) {
    const firstRow = lines.findIndex((l) => readRoundLine(l));
    return renumberWorksheet([
      ...lines.slice(0, firstRow < 0 ? lines.length : firstRow),
      ...incoming,
    ]);
  }
  lines.splice(line - 1, 1, ...incoming);
  return renumberWorksheet(lines);
}
/** Totals are generated at export time, so saved counts never become stale. */
export function writtenPattern(source: string) {
  return source
    .split(/\r?\n/)
    .map((line) => {
      const row = readRoundLine(line);
      if (!row) return line;
      const body = worksheetInstruction(line);
      try {
        const summary = analyzeInstruction(body);
        const span = summary.repeatRounds ?? 1;
        const parts = body.split("//");
        return `Rnd ${row.start}${span > 1 ? "–" + (row.start + span - 1) : ""}: ${parts[0].trim()} (${summary.outputCount})${parts.length > 1 ? " //" + parts.slice(1).join("//") : ""}`;
      } catch {
        return line;
      }
    })
    .join("\n");
}

/** Spreadsheet export keeps grouped rounds and calculates totals per round. */
export function csvPattern(source: string) {
  const rows: (string | number)[][] = [
    ["Round", "Instructions", "Total", "Yarn", "Notes"],
  ];
  let yarn = "";
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const color = /^\s*\[([^\]]+)\]\s*$/.exec(line);
    if (color) {
      yarn = color[1];
      rows.push(["", "", "", yarn, ""]);
      continue;
    }
    const row = readRoundLine(line);
    if (!row) {
      rows.push(["", "", "", "", line.replace(/^\s*(?:#+|\/\/)\s*/, "")]);
      continue;
    }
    const body = worksheetInstruction(line);
    const [instruction, ...comments] = body.split("//");
    let total: number | string = "";
    let end = row.end ?? row.start;
    try {
      const summary = analyzeInstruction(body);
      total = summary.outputCount;
      end = row.start + (summary.repeatRounds ?? 1) - 1;
    } catch {
      // Keep unfinished instructions without inventing a stitch total.
    }
    rows.push([
      `Rnd ${row.start}${end > row.start ? "–" + end : ""}`,
      instruction.trim(),
      total,
      yarn,
      comments.join("//").trim(),
    ]);
  }
  // Quote every field, escape quotes, and neutralize spreadsheet formulas.
  const cell = (value: string | number) => {
    const text = String(value);
    const safe = /^[\s]*[=+@-]/.test(text) ? "'" + text : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

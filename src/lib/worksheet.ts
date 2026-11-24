import { analyzeInstruction, readRoundLine, parsePattern, type Operation } from "./pattern";

export function stripWrittenCount(text: string) {
  return text.replace(/\s*(?:\(\d+\)|→\s*\d+)\s*(?=\/\/|$)/, "");
}
export function worksheetInstruction(line: string) {
  const row = readRoundLine(line);
  if (!row) return "";
  const body = stripWrittenCount(row.instruction);
  if (row.end !== null && !/\bfor\s+\d+\s+(?:rows?|rounds?|rnds?)\b/i.test(body)) {
    const parts = body.split("//");
    return `${parts[0].trim()} for ${row.end - row.start + 1} ${row.kind==='row'?'rows':'rounds'}${parts.length > 1 ? " //" + parts.slice(1).join("//") : ""}`;
  }
  return body;
}
function duration(body: string) {
  const match = /\bfor\s+(\d+)\s+(?:rows?|rounds?|rnds?)\b/i.exec(body);
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
      const label = `${row.kind==='row'?'Row':'Rnd'} ${next}${span > 1 ? "–" + end : ""}`;
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
    `${readRoundLine(lines[line-1])?.kind==='row'?'Row':'Rnd'} 1: ${stripWrittenCount(instruction.replace(/\r?\n/g, " "))}`;
  return renumberWorksheet(lines);
}
export function insertWorksheetRow(source: string, afterLine: number) {
  const lines = source ? source.split(/\r?\n/) : [];
  lines.splice(afterLine, 0, parsePattern(source).construction==='rows' || lines.some(l=>readRoundLine(l)?.kind==='row') ? 'Row 1: ' : 'Rnd 1: ');
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
  const lines = source.split(/\r?\n/);
  const flat = parsePattern(source).construction==='rows';
  const incoming = text
    .replace(/\r/g, "")
    .trim()
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const row =
        /^(?:(?:row|rnd|round|r)\.?\s*\d|\d+(?:\s*[-–]\s*\d+)?\s*:)/i.test(l.trim())
          ? readRoundLine(l)
          : null;
      return row
        ? `${row.kind==='row'?'Row':'Rnd'} ${row.start}${row.end ? "–" + row.end : ""}: ${stripWrittenCount(row.instruction)}`
        : `${flat?'Row':'Rnd'} 1: ${stripWrittenCount(l.trim())}`;
    });
  if (!incoming.length) return source;
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
  const parsed=parsePattern(source);
  return source
    .split(/\r?\n/)
    .map((line, index) => {
      const row = readRoundLine(line);
      if (!row) return line;
      const body = worksheetInstruction(line);
      try {
        const summary = analyzeInstruction(body,parsed.rounds.find(r=>r.line===index+1)?.inputCount || undefined,row.kind==='row');
        const span = summary.repeatRounds ?? 1;
        const parts = body.split("//");
        return `${row.kind==='row'?'Row':'Rnd'} ${row.start}${span > 1 ? "–" + (row.start + span - 1) : ""}: ${parts[0].trim()} (${summary.outputCount})${parts.length > 1 ? " //" + parts.slice(1).join("//") : ""}`;
      } catch {
        return line;
      }
    })
    .join("\n");
}

/** Spreadsheet export keeps grouped rounds and calculates totals per round. */
export function csvPattern(source: string) {
  const parsed=parsePattern(source);
  const rows: (string | number)[][] = [
    [parsed.construction==='rows'?"Row":"Round", "Instructions", "Total", "Yarn", "Notes"],
  ];
  let yarn = "red";
  for (const [index,line] of source.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const [code, ...notes] = line.split("//");
    const color = /^\s*\[([^\]]+)\]\s*$/.exec(code);
    if (color) {
      yarn = color[1].trim().toLowerCase();
      rows.push(["", "", "", yarn, notes.join("//").trim()]);
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
    let rowYarns = yarn;
    try {
      const summary = analyzeInstruction(body,parsed.rounds.find(r=>r.line===index+1)?.inputCount || undefined,row.kind==='row');
      total = summary.outputCount;
      end = row.start + (summary.repeatRounds ?? 1) - 1;
      const used = new Set<string>();
      // A grouped row may inherit the previous repetition's final color.
      // After two passes the color state and set of used yarns are stable.
      for (let pass = 0; pass < Math.min(2, summary.repeatRounds ?? 1); pass++) {
        const visit = (operations: Operation[]) => {
          for (const operation of operations) {
            if (typeof operation === "string" || "branch" in operation) used.add(yarn);
            else if ("same" in operation) visit(operation.same);
            else if ("stitch" in operation) {
              for (const color of operation.colors) used.add(color ?? yarn);
            } else yarn = operation.name;
          }
        };
        visit(summary.turning);visit(summary.operations);
      }
      rowYarns = [...used].join("; ");
    } catch {
      // Keep unfinished instructions without inventing a stitch total.
    }
    rows.push([
      `${row.kind==='row'?'Row':'Rnd'} ${row.start}${end > row.start ? "–" + end : ""}`,
      instruction.trim(),
      total,
      rowYarns,
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

/** Move an instruction row; standalone notes/directives keep their source positions. */
export function moveWorksheetRow(source: string, fromLine: number, toLine: number, after=false): string {
  const lines=source.split(/\r?\n/);
  const slots=lines.flatMap((line,i)=>readRoundLine(line)?[i]:[]);
  const from=slots.indexOf(fromLine-1),to=slots.indexOf(toLine-1);
  if(from<0 || to<0 || from===to)return source;
  const rows=slots.map(i=>lines[i]);
  const [moved]=rows.splice(from,1);
  const destination=to+(after?1:0)-(from<to?1:0);
  if(destination===from)return source;
  rows.splice(destination,0,moved);
  slots.forEach((slot,i)=>{lines[slot]=rows[i];});
  return renumberWorksheet(lines);
}

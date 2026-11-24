import { insertWorksheetRow } from '../lib/worksheet';
import { completeRoundCount } from "../lib/completeRoundCount";
import { useEffect, useRef } from "react";
import {
  EditorSelection,
  Annotation,
  Transaction,
  EditorState,
  StateEffect,
  StateField,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  type DecorationSet,
} from "@codemirror/view";
import {
  HighlightStyle,
  StreamLanguage,
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { tags } from "@lezer/highlight";
import { resolveYarnColor, type Diagnostic } from "../lib/pattern";
import "./PatternEditor.css";

export interface PatternEditorProps {
  value: string;
  onChange: (value: string) => void;
  diagnostics: Diagnostic[];
  onRender: () => void;
  selectedLine: number | null;
  onActiveLineChange: (line: number | null) => void;
}

const crochetLanguage = StreamLanguage.define({
  token(stream) {
    const atLineStart = stream.string.slice(0, stream.pos).trim().length === 0;
    if (stream.eatSpace()) return null;
    if (stream.match("//")) {
      stream.skipToEnd();
      return "comment";
    }
    if (atLineStart && stream.peek() === "#") {
      stream.skipToEnd();
      return "heading";
    }
    if (atLineStart && stream.match(/orientation\s+(?:top-down|bottom-up)\b/i)) return "operator";
    const color = stream.match(/\[\s*(#[\da-fA-F]+|[A-Za-z]+)\s*\]/, false);
    if (Array.isArray(color) && resolveYarnColor(color[1])) {
      stream.pos += color[0].length;
      return "string";
    }
    if (stream.match(/(?:sc|hdc|dc|tr|dtr|ch|inc3?|dec3?|sk|slst|sl|ss|bobble[234]?|bbl|trbo|puff|popcorn|shell)\b/i))
      return "keyword";
    if (
      stream.match(/[×*]/) ||
      stream.match(/(?:BLO|FLO|of|back|join|counts|as|hook|one|rep|repeat|times|in|for|rows?|rounds?|rnds?|turn|across|x|same|st|branch|eyes|between|and|at|size|embroider|embroidery|dk|bulky|edge|open|auto)\b/i)
    )
      return "operator";
    if (stream.match(/(?:mc|mr)\b/i)) return "typeName";
    if (stream.match(/\d+/)) return "number";
    if (stream.match(/[\[\]()]/)) return "bracket";
    if (stream.match(/[:,]/)) return "punctuation";
    if (stream.match(/[A-Za-z_][\w-]*/)) return "variableName";
    stream.next();
    return null;
  },
  languageData: { commentTokens: { line: "//" } },
});

const crochetHighlight = HighlightStyle.define([
  { tag: tags.heading, color: "var(--ui-muted, #9b9a94)", fontStyle: "italic" },
  { tag: tags.comment, color: "var(--ui-muted, #a2a29b)", fontStyle: "italic" },
  { tag: tags.keyword, color: "var(--ui-green, #4d7d70)", fontWeight: "500" },
  { tag: tags.operator, color: "var(--ui-accent, #9a6d8d)" },
  { tag: tags.typeName, color: "var(--ui-warm, #a77643)" },
  { tag: tags.number, color: "var(--ui-warm, #b26d48)" },
  { tag: tags.string, color: "var(--ui-warm, #bd6554)", fontWeight: "500" },
  { tag: tags.punctuation, color: "var(--ui-muted, #93948d)" },
  { tag: tags.bracket, color: "var(--ui-muted, #858b82)" },
  { tag: tags.variableName, color: "var(--ui-ink, #616960)" },
]);

// Exact yarn swatches remain editable text, including model-generated paint entries.
function yarnDecorations(state: EditorState): DecorationSet {
  const marks = [];
  for (const match of state.doc.toString().matchAll(/#[a-fA-F0-9]{6}\b/g)) {
    const color = match[0];
    marks.push(Decoration.mark({
      class: 'cm-yarn-color',
      attributes: { style: `border-bottom: 4px solid ${color}`, title: `Yarn ${color.toUpperCase()}` },
    }).range(match.index!, match.index! + color.length));
  }
  return Decoration.set(marks, true);
}
const yarnColorsField = StateField.define<DecorationSet>({
  create: yarnDecorations,
  update: (value, transaction) => transaction.docChanged ? yarnDecorations(transaction.state) : value,
  provide: field => EditorView.decorations.from(field),
});

const externalSync = Annotation.define<boolean>();
const setDiagnostics = StateEffect.define<Diagnostic[]>();
const setSelectedLine = StateEffect.define<number | null>();

function diagnosticDecorations(
  state: EditorState,
  diagnostics: Diagnostic[],
): DecorationSet {
  const lines = new Map<number, Diagnostic[]>();
  for (const diagnostic of diagnostics) {
    if (diagnostic.line < 1 || diagnostic.line > state.doc.lines) continue;
    const existing = lines.get(diagnostic.line) ?? [];
    existing.push(diagnostic);
    lines.set(diagnostic.line, existing);
  }

  const decorations = Array.from(lines.entries()).map(([number, items]) => {
    const hasError = items.some((item) => item.severity === "error");
    return Decoration.line({
      class: hasError ? "cm-pattern-error" : "cm-pattern-warning",
      attributes: { title: items.map((item) => item.message).join("\n") },
    }).range(state.doc.line(number).from);
  });
  return Decoration.set(decorations, true);
}

const diagnosticsField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let result = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setDiagnostics)) {
        result = diagnosticDecorations(transaction.state, effect.value);
      }
    }
    return result;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const selectedLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let result = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setSelectedLine)) continue;
      const number = effect.value;
      result =
        number && number > 0 && number <= transaction.state.doc.lines
          ? Decoration.set([
              Decoration.line({ class: "cm-pattern-selected-source" }).range(
                transaction.state.doc.line(number).from,
              ),
            ])
          : Decoration.none;
    }
    return result;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function PatternEditor({
  value,
  onChange,
  diagnostics,
  onRender,
  selectedLine,
  onActiveLineChange,
}: PatternEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onRenderRef = useRef(onRender);
  const onActiveLineRef = useRef(onActiveLineChange);
  const initialValue = useRef(value);

  onChangeRef.current = onChange;
  onRenderRef.current = onRender;
  onActiveLineRef.current = onActiveLineChange;

  useEffect(() => {
    if (!host.current) return;

    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initialValue.current,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          history(),
          indentOnInput(),
          bracketMatching(),
          crochetLanguage,
          syntaxHighlighting(crochetHighlight),
          diagnosticsField,
          yarnColorsField,
          selectedLineField,
          EditorState.tabSize.of(2),
          EditorView.contentAttributes.of({
            "aria-label": "Crochet pattern code",
            "aria-multiline": "true",
            "data-testid": "pattern-code",
            spellcheck: "false",
            autocapitalize: "off",
            autocorrect: "off",
          }),
          keymap.of([
            {
              key: "Mod-Enter",
              run: () => {
                onRenderRef.current();
                return true;
              },
            },
            { key: "Tab", run: completeRoundCount },
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !update.transactions.some(t => t.annotation(externalSync)))
              onChangeRef.current(update.state.doc.toString());
            if (update.selectionSet || update.docChanged || update.focusChanged && update.view.hasFocus)
              onActiveLineRef.current(update.state.doc.lineAt(update.state.selection.main.head).number);
          }),
          EditorView.domEventHandlers({
            mousemove(event, view) {
              if (event.buttons || !view.contentDOM.contains(event.target as Node)) return;
              const position = view.posAtCoords({x: event.clientX, y: event.clientY});
              onActiveLineRef.current(position === null ? null : view.state.doc.lineAt(position).number);
            },
            mouseleave(_event, view) {
              onActiveLineRef.current(view.state.doc.lineAt(view.state.selection.main.head).number);
            },
          }),
        ],
      }),
    });

    const insert = (event: Event) => {
      const text = (event as CustomEvent<string>).detail;
      if(text==='new-row') {
        const line=view.state.doc.lineAt(view.state.selection.main.head).number;
        const next=insertWorksheetRow(view.state.doc.toString(),line);
        const end=next.split('\n').slice(0,line+1).join('\n').length;
        view.dispatch({changes:{from:0,to:view.state.doc.length,insert:next},selection:{anchor:end},scrollIntoView:true,userEvent:'input'});
      } else view.dispatch(view.state.replaceSelection(text));
      view.focus();
    };
    window.addEventListener("loopform:insert", insert);
    editor.current = view;
    onActiveLineRef.current(view.state.doc.lineAt(view.state.selection.main.head).number);
    return () => {
      window.removeEventListener("loopform:insert", insert);
      editor.current = null;
      view.destroy();
    };
  }, []);

  useEffect(() => {
    const view = editor.current;
    if (!view || value === view.state.doc.toString()) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: EditorSelection.cursor(Math.min(view.state.selection.main.head, value.length)),
      annotations: [externalSync.of(true), Transaction.addToHistory.of(false)],
    });
  }, [value]);

  useEffect(() => {
    editor.current?.dispatch({ effects: setDiagnostics.of(diagnostics) });
  }, [diagnostics]);

  useEffect(() => {
    const view = editor.current;
    if (!view) return;
    const effects = [setSelectedLine.of(selectedLine)];
    if (
      selectedLine &&
      selectedLine > 0 &&
      selectedLine <= view.state.doc.lines
    ) {
      view.dispatch({
        effects: [
          ...effects,
          EditorView.scrollIntoView(view.state.doc.line(selectedLine).from, {
            y: "center",
          }),
        ],
      });
    } else {
      view.dispatch({ effects });
    }
  }, [selectedLine]);

  return <div className="pattern-code-editor" ref={host} />;
}

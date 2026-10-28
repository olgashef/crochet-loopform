import { useEffect, useRef } from "react";
import {
  EditorSelection,
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
    const color = stream.match(/\[\s*(#[\da-fA-F]+|[A-Za-z]+)\s*\]/, false);
    if (Array.isArray(color) && resolveYarnColor(color[1])) {
      stream.pos += color[0].length;
      return "string";
    }
    if (stream.match(/(?:sc|hdc|dc|tr|ch|inc|dec|slst|ss|bobble|bbl)\b/i))
      return "keyword";
    if (
      stream.match(/[×*]/) ||
      stream.match(/(?:rep|repeat|times|in|for|rounds?|rnds?|x|same|st|branch|eyes|between|and|at|size)\b/i)
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
  { tag: tags.heading, color: "#9b9a94", fontStyle: "italic" },
  { tag: tags.comment, color: "#a2a29b", fontStyle: "italic" },
  { tag: tags.keyword, color: "#4d7d70", fontWeight: "500" },
  { tag: tags.operator, color: "#9a6d8d" },
  { tag: tags.typeName, color: "#a77643" },
  { tag: tags.number, color: "#b26d48" },
  { tag: tags.string, color: "#bd6554", fontWeight: "500" },
  { tag: tags.punctuation, color: "#93948d" },
  { tag: tags.bracket, color: "#858b82" },
  { tag: tags.variableName, color: "#616960" },
]);

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
}: PatternEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onRenderRef = useRef(onRender);
  const initialValue = useRef(value);

  onChangeRef.current = onChange;
  onRenderRef.current = onRender;

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
            ...defaultKeymap,
            ...historyKeymap,
            indentWithTab,
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });

    editor.current = view;
    return () => {
      editor.current = null;
      view.destroy();
    };
  }, []);

  useEffect(() => {
    const view = editor.current;
    if (!view || value === view.state.doc.toString()) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
      selection: EditorSelection.cursor(0),
      effects: EditorView.scrollIntoView(0),
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

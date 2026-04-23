"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { closeBrackets, closeBracketsKeymap, autocompletion, completionKeymap } from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
} from "@codemirror/commands";
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";
import { sql } from "@codemirror/lang-sql";
import { Compartment, EditorState } from "@codemirror/state";
import {
  search,
  searchKeymap,
  highlightSelectionMatches,
} from "@codemirror/search";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder as editorPlaceholder,
  rectangularSelection,
} from "@codemirror/view";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

type CodeEditorProps = {
  ariaLabel: string;
  className?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  value: string;
};

const themeStyles = {
  "&": {
    height: "100%",
    minHeight: "100%",
    borderRadius: "1rem",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    fontSize: "0.875rem",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "var(--font-geist-mono), monospace",
    lineHeight: "1.7",
  },
  ".cm-content, .cm-gutter": {
    minHeight: "100%",
    paddingTop: "1rem",
    paddingBottom: "1rem",
  },
  ".cm-content": {
    caretColor: "var(--foreground)",
    paddingRight: "1rem",
  },
  ".cm-line": {
    paddingLeft: "0.25rem",
  },
  ".cm-gutters": {
    minHeight: "100%",
    borderRight: "1px solid var(--border)",
    backgroundColor: "color-mix(in oklch, var(--card) 82%, var(--background) 18%)",
    color: "var(--muted-foreground)",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in oklch, var(--accent) 72%, transparent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "color-mix(in oklch, var(--accent) 82%, transparent)",
    color: "var(--foreground)",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection":
    {
      backgroundColor: "color-mix(in oklch, var(--ring) 28%, transparent)",
    },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--foreground)",
  },
  ".cm-panels": {
    borderBottom: "1px solid var(--border)",
    backgroundColor: "var(--card)",
    color: "var(--foreground)",
  },
  ".cm-search": {
    gap: "0.5rem",
    padding: "0.75rem",
    fontFamily: "var(--font-geist-sans), sans-serif",
  },
  ".cm-search input, .cm-search button, .cm-search label": {
    fontSize: "0.875rem",
  },
  ".cm-search input": {
    border: "1px solid var(--border)",
    borderRadius: "0.75rem",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    padding: "0.45rem 0.75rem",
  },
  ".cm-search button": {
    border: "1px solid var(--border)",
    borderRadius: "0.75rem",
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    padding: "0.45rem 0.75rem",
  },
  ".cm-tooltip": {
    overflow: "hidden",
    border: "1px solid var(--border)",
    borderRadius: "1rem",
    backgroundColor: "var(--card)",
    color: "var(--foreground)",
    boxShadow: "0 14px 28px rgba(15, 23, 42, 0.14)",
  },
  ".cm-tooltip-autocomplete ul": {
    fontFamily: "var(--font-geist-mono), monospace",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
  ".cm-matchingBracket": {
    borderBottom: "1px solid var(--ring)",
    color: "var(--foreground)",
  },
  ".cm-nonmatchingBracket": {
    color: "oklch(0.62 0.23 25)",
  },
};

function buildEditorTheme(isDark: boolean) {
  return EditorView.theme(themeStyles, { dark: isDark });
}

export function CodeEditor({
  ariaLabel,
  className,
  onChange,
  placeholder,
  readOnly = false,
  value,
}: CodeEditorProps) {
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const { resolvedTheme } = useTheme();
  const handleChange = useEffectEvent((nextValue: string) => {
    onChange(nextValue);
  });
  const [themeCompartment] = useState(() => new Compartment());
  const [editableCompartment] = useState(() => new Compartment());
  const [readOnlyCompartment] = useState(() => new Compartment());
  const [contentAttributesCompartment] = useState(() => new Compartment());
  const [placeholderCompartment] = useState(() => new Compartment());
  const themeMode = resolvedTheme === "dark" ? "dark" : "light";

  useEffect(() => {
    if (!editorHostRef.current || editorViewRef.current) {
      return;
    }

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        indentOnInput(),
        rectangularSelection(),
        highlightActiveLine(),
        search(),
        highlightSelectionMatches(),
        sql(),
        bracketMatching(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        autocompletion(),
        closeBrackets(),
        themeCompartment.of(buildEditorTheme(themeMode === "dark")),
        editableCompartment.of(EditorView.editable.of(!readOnly)),
        readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
        contentAttributesCompartment.of(
          EditorView.contentAttributes.of({
            "aria-label": ariaLabel,
            spellcheck: "false",
          }),
        ),
        placeholderCompartment.of(
          placeholder ? editorPlaceholder(placeholder) : [],
        ),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...completionKeymap,
          ...lintKeymap,
        ]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            handleChange(update.state.doc.toString());
          }
        }),
      ],
    });

    editorViewRef.current = new EditorView({
      parent: editorHostRef.current,
      state,
    });

    return () => {
      editorViewRef.current?.destroy();
      editorViewRef.current = null;
    };
  }, [
    editableCompartment,
    contentAttributesCompartment,
    placeholder,
    placeholderCompartment,
    readOnly,
    readOnlyCompartment,
    ariaLabel,
    themeCompartment,
    themeMode,
    value,
  ]);

  useEffect(() => {
    const view = editorViewRef.current;

    if (!view || value === view.state.doc.toString()) {
      return;
    }

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
    });
  }, [value]);

  useEffect(() => {
    const view = editorViewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: themeCompartment.reconfigure(buildEditorTheme(themeMode === "dark")),
    });
  }, [themeCompartment, themeMode]);

  useEffect(() => {
    const view = editorViewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: [
        editableCompartment.reconfigure(EditorView.editable.of(!readOnly)),
        readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
      ],
    });
  }, [editableCompartment, readOnly, readOnlyCompartment]);

  useEffect(() => {
    const view = editorViewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: contentAttributesCompartment.reconfigure(
        EditorView.contentAttributes.of({
          "aria-label": ariaLabel,
          spellcheck: "false",
        }),
      ),
    });
  }, [ariaLabel, contentAttributesCompartment]);

  useEffect(() => {
    const view = editorViewRef.current;

    if (!view) {
      return;
    }

    view.dispatch({
      effects: placeholderCompartment.reconfigure(
        placeholder ? editorPlaceholder(placeholder) : [],
      ),
    });
  }, [placeholder, placeholderCompartment]);

  return (
    <div
      className={cn(
        "min-h-[340px] overflow-hidden rounded-2xl border border-border bg-background transition focus-within:border-ring focus-within:ring-4 focus-within:ring-ring/15 sm:min-h-[460px]",
        className,
      )}
    >
      <div
        ref={editorHostRef}
        className="h-full min-h-[340px] sm:min-h-[460px]"
      />
    </div>
  );
}

"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Highlight from "@tiptap/extension-highlight";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { VariableNode } from "./extensions/variable-node";
import { EditorToolbar } from "./EditorToolbar";
import { cn } from "@/lib/utils";
import { useEffect } from "react";
import "./editor-styles.css";

interface VariableOption {
  key: string;
  label: string;
}

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  variables?: VariableOption[];
  placeholder?: string;
  className?: string;
}

export function RichTextEditor({
  content,
  onChange,
  variables,
  placeholder = "Saisissez le contenu du document...",
  className,
}: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      Highlight,
      TextStyle,
      Color,
      VariableNode,
    ],
    content,
    editorProps: {
      attributes: {
        class: "focus:outline-none",
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Sync external content changes (e.g. when switching templates)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  if (!editor) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-md border">
        <span className="text-sm text-muted-foreground">
          Chargement de l&apos;editeur...
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "tiptap-editor overflow-hidden rounded-md border bg-background",
        className
      )}
    >
      <EditorToolbar editor={editor} variables={variables} />
      <EditorContent editor={editor} />
    </div>
  );
}

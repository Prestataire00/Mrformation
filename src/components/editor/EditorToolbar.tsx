"use client";

import { type Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Table,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Code,
  Undo,
  Redo,
  Variable,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface VariableOption {
  key: string;
  label: string;
}

interface EditorToolbarProps {
  editor: Editor;
  variables?: VariableOption[];
}

function ToolbarButton({
  onClick,
  isActive = false,
  title,
  children,
}: {
  onClick: () => void;
  isActive?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "h-8 w-8 p-0",
        isActive && "bg-accent text-accent-foreground"
      )}
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  );
}

function Separator() {
  return <div className="mx-1 h-6 w-px bg-border" />;
}

export function EditorToolbar({ editor, variables }: EditorToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 px-2 py-1.5">
      {/* Undo / Redo */}
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        title="Annuler"
      >
        <Undo className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        title="Refaire"
      >
        <Redo className="h-4 w-4" />
      </ToolbarButton>

      <Separator />

      {/* Text formatting */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        title="Gras"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        title="Italique"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive("underline")}
        title="Souligner"
      >
        <Underline className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive("strike")}
        title="Barrer"
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>

      <Separator />

      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive("heading", { level: 1 })}
        title="Titre 1"
      >
        <Heading1 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive("heading", { level: 2 })}
        title="Titre 2"
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive("heading", { level: 3 })}
        title="Titre 3"
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>

      <Separator />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        title="Liste a puces"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        title="Liste numerotee"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>

      <Separator />

      {/* Alignment */}
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        isActive={editor.isActive({ textAlign: "left" })}
        title="Aligner a gauche"
      >
        <AlignLeft className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        isActive={editor.isActive({ textAlign: "center" })}
        title="Centrer"
      >
        <AlignCenter className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        isActive={editor.isActive({ textAlign: "right" })}
        title="Aligner a droite"
      >
        <AlignRight className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        isActive={editor.isActive({ textAlign: "justify" })}
        title="Justifier"
      >
        <AlignJustify className="h-4 w-4" />
      </ToolbarButton>

      <Separator />

      {/* Table */}
      <ToolbarButton
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
        title="Inserer un tableau"
      >
        <Table className="h-4 w-4" />
      </ToolbarButton>

      {/* Code block */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive("codeBlock")}
        title="Bloc de code"
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>

      {/* Variables dropdown */}
      {variables && variables.length > 0 && (
        <>
          <Separator />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs"
              >
                <Variable className="h-3.5 w-3.5" />
                Inserer une variable
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="max-h-64 overflow-y-auto"
            >
              {variables.map((v) => (
                <DropdownMenuItem
                  key={v.key}
                  onClick={() =>
                    editor.chain().focus().insertVariable(v.key).run()
                  }
                  className="gap-2"
                >
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 font-mono text-xs text-blue-700">
                    {`{{${v.key}}}`}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {v.label}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
}

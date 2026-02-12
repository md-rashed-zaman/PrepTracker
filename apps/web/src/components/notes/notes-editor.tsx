"use client";

import * as React from "react";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import { common, createLowlight } from "lowlight";

import { SlashCommand } from "@/components/notes/slash-command";
import { CodeTabs, extractCodeTabsFromMarkdown } from "@/components/notes/code-tabs";
import { CodeBlockWithToolbar } from "@/components/notes/code-block-with-toolbar";

export type NotesDoc = {
  markdown: string;
  json: any;
};

const lowlight = createLowlight(common);

function looksLikeMarkdown(text: string) {
  const t = text.trim();
  if (!t) return false;
  if (t.includes("```")) return true;
  if (/^#{1,6}\s+\S/m.test(t)) return true;
  if (/^\s*[-*+]\s+\S/m.test(t)) return true;
  if (/^\s*\d+\.\s+\S/m.test(t)) return true;
  if (/^\s*>\s+\S/m.test(t)) return true;
  if (/^\s*---\s*$/m.test(t)) return true;
  return false;
}

export function NotesEditor(props: {
  initialJSON: any;
  onChange: (doc: NotesDoc) => void;
  readOnly?: boolean;
}) {
  const { initialJSON, onChange, readOnly } = props;

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
      Placeholder.configure({
        placeholder: "Write notes… Type / for commands.",
      }),
      CodeBlockWithToolbar.configure({ lowlight }),
      CodeTabs,
      Markdown,
      SlashCommand,
    ],
    content: initialJSON,
    editorProps: {
      handlePaste: (_view, event) => {
        if (!editor || readOnly) return false;
        const text = event.clipboardData?.getData("text/plain") || "";
        const tabs = extractCodeTabsFromMarkdown(text);
        if (tabs) {
          editor.commands.insertContent({ type: "codeTabs", attrs: { tabs, activeIndex: 0 } });
          return true;
        }
        if (!looksLikeMarkdown(text)) return false;
        // TipTap's Markdown extension only parses when contentType is explicitly set.
        editor.chain().focus().run();
        editor.commands.insertContent(text, { contentType: "markdown" as any });
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      const md = editor.getMarkdown?.() || "";
      onChange({ markdown: md, json: editor.getJSON() });
    },
  });

  React.useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(initialJSON);
  }, [editor, initialJSON]);

  if (!editor) return <div className="text-sm text-[color:var(--muted)]">Loading editor…</div>;

  return (
    <div className="pf-notes-editor">
      <EditorContent editor={editor} />
    </div>
  );
}

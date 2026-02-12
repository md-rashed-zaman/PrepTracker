"use client";

import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";

type Cmd = {
  title: string;
  description: string;
  keywords: string[];
  run: (ctx: { editor: any; range: { from: number; to: number } }) => void;
};

const COMMANDS: Cmd[] = [
  {
    title: "Heading 1",
    description: "Big section heading",
    keywords: ["h1", "heading", "title"],
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    keywords: ["h2", "heading", "subtitle"],
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    keywords: ["h3", "heading"],
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
  },
  {
    title: "Bullet list",
    description: "Create a bullet list",
    keywords: ["ul", "bullet", "list"],
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: "Numbered list",
    description: "Create an ordered list",
    keywords: ["ol", "number", "ordered", "list"],
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: "Quote",
    description: "Callout a key insight",
    keywords: ["quote", "blockquote"],
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: "Code block",
    description: "Paste code with formatting",
    keywords: ["code", "snippet", "block"],
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setCodeBlock().run(),
  },
  {
    title: "Code tabs",
    description: "Keep multiple languages in one block",
    keywords: ["code", "tabs", "language", "solution"],
    run: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({
          type: "codeTabs",
          attrs: {
            tabs: [{ id: `tab_${Date.now()}`, language: "cpp", code: "" }],
            activeIndex: 0,
          },
        })
        .run(),
  },
  {
    title: "Divider",
    description: "Visual separator",
    keywords: ["hr", "divider", "separator"],
    run: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
];

function matches(cmd: Cmd, q: string) {
  if (!q) return true;
  const needle = q.toLowerCase();
  if (cmd.title.toLowerCase().includes(needle)) return true;
  if (cmd.description.toLowerCase().includes(needle)) return true;
  return cmd.keywords.some((k) => k.includes(needle));
}

export const SlashCommand = Extension.create({
  name: "slashCommand",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      Suggestion({
        editor,
        char: "/",
        startOfLine: false,
        items: ({ query }: { query: string }) => COMMANDS.filter((c) => matches(c, query)).slice(0, 8),
        command: ({ editor, range, props }: any) => {
          (props as Cmd).run({ editor, range });
        },
        render: () => {
          let root: HTMLDivElement | null = null;
          let selectedIndex = 0;

          const reposition = (clientRect?: DOMRect | null) => {
            if (!root || !clientRect) return;
            const margin = 8;
            const width = 320;
            const left = Math.min(window.innerWidth - width - margin, Math.max(margin, clientRect.left));
            const top = Math.min(window.innerHeight - margin, clientRect.bottom + 8);
            root.style.left = `${left}px`;
            root.style.top = `${top}px`;
            root.style.width = `${width}px`;
          };

          const renderItems = (items: Cmd[]) => {
            if (!root) return;
            root.innerHTML = "";

            const list = document.createElement("div");
            list.style.display = "flex";
            list.style.flexDirection = "column";
            list.style.gap = "4px";
            root.appendChild(list);

            items.forEach((item, idx) => {
              const row = document.createElement("button");
              row.type = "button";
              row.style.all = "unset";
              row.style.cursor = "pointer";
              row.style.borderRadius = "14px";
              row.style.padding = "10px 12px";
              row.style.border = "1px solid var(--line)";
              row.style.background = idx === selectedIndex ? "rgba(15,118,110,.10)" : "transparent";
              row.style.display = "flex";
              row.style.flexDirection = "column";
              row.style.gap = "2px";

              const title = document.createElement("div");
              title.textContent = item.title;
              title.style.fontSize = "13px";
              title.style.fontWeight = "650";
              title.style.color = "var(--foreground)";

              const desc = document.createElement("div");
              desc.textContent = item.description;
              desc.style.fontSize = "12px";
              desc.style.color = "var(--muted)";

              row.appendChild(title);
              row.appendChild(desc);
              row.addEventListener("mouseenter", () => {
                selectedIndex = idx;
                renderItems(items);
              });
              row.addEventListener("mousedown", (e) => {
                // Prevent editor blur.
                e.preventDefault();
              });
              row.addEventListener("click", () => {
                item.run({ editor, range: (root as any).__range });
              });

              list.appendChild(row);
            });

            if (items.length === 0) {
              const empty = document.createElement("div");
              empty.textContent = "No commands";
              empty.style.fontSize = "12px";
              empty.style.color = "var(--muted)";
              empty.style.padding = "10px 12px";
              list.appendChild(empty);
            }
          };

          return {
            onStart: (props: any) => {
              selectedIndex = 0;
              root = document.createElement("div");
              root.className = "pf-paper";
              root.style.position = "fixed";
              root.style.zIndex = "60";
              root.style.padding = "8px";
              root.style.background = "var(--card)";
              root.style.boxShadow = "var(--shadow)";
              root.style.borderRadius = "24px";
              root.style.border = "1px solid var(--line)";
              (root as any).__range = props.range;
              document.body.appendChild(root);
              reposition(props.clientRect?.());
              renderItems(props.items || []);
            },
            onUpdate: (props: any) => {
              (root as any).__range = props.range;
              reposition(props.clientRect?.());
              const items = props.items || [];
              if (selectedIndex >= items.length) selectedIndex = Math.max(0, items.length - 1);
              renderItems(items);
            },
            onKeyDown: (props: any) => {
              const items: Cmd[] = props.items || [];
              if (props.event.key === "Escape") {
                return true;
              }
              if (props.event.key === "ArrowDown") {
                selectedIndex = items.length ? (selectedIndex + 1) % items.length : 0;
                renderItems(items);
                return true;
              }
              if (props.event.key === "ArrowUp") {
                selectedIndex = items.length ? (selectedIndex - 1 + items.length) % items.length : 0;
                renderItems(items);
                return true;
              }
              if (props.event.key === "Enter") {
                const it = items[selectedIndex];
                if (it) it.run({ editor, range: props.range });
                return true;
              }
              return false;
            },
            onExit: () => {
              if (root) root.remove();
              root = null;
            },
          };
        },
      }),
    ];
  },
});


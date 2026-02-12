"use client";

import * as React from "react";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

type CodeTab = {
  id: string;
  language: string;
  code: string;
};

const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: "cpp", label: "C++" },
  { value: "go", label: "Go" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "sql", label: "SQL" },
  { value: "text", label: "Text" },
];

function newId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `tab_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function normalizeLanguage(lang: string) {
  const v = (lang || "").trim().toLowerCase();
  if (!v) return "text";
  // Accept formats like "cpp []" from leetcode-style notes.
  const first = v.split(/\s+/)[0].replace(/\[\]$/g, "");
  return first || "text";
}

function safeJsonParse(s: string | null) {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function CodeTabsView(props: any) {
  const { node, updateAttributes, editor } = props;
  const editable = editor?.isEditable ?? true;

  const tabs: CodeTab[] = Array.isArray(node?.attrs?.tabs) ? node.attrs.tabs : [];
  const activeIndex: number = Number.isFinite(node?.attrs?.activeIndex) ? Number(node.attrs.activeIndex) : 0;
  const clampedActive = Math.max(0, Math.min(activeIndex, Math.max(0, tabs.length - 1)));

  React.useEffect(() => {
    if (activeIndex !== clampedActive) updateAttributes({ activeIndex: clampedActive });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, clampedActive]);

  const active = tabs[clampedActive] || null;

  function setActive(idx: number) {
    updateAttributes({ activeIndex: idx });
  }

  function setLanguage(idx: number, language: string) {
    const next = tabs.map((t, i) => (i === idx ? { ...t, language } : t));
    updateAttributes({ tabs: next });
  }

  function setCode(idx: number, code: string) {
    const next = tabs.map((t, i) => (i === idx ? { ...t, code } : t));
    updateAttributes({ tabs: next });
  }

  function addTab() {
    const next = [...tabs, { id: newId(), language: "go", code: "" }];
    updateAttributes({ tabs: next, activeIndex: next.length - 1 });
  }

  function removeTab(idx: number) {
    if (tabs.length <= 1) return;
    const next = tabs.filter((_, i) => i !== idx);
    const nextActive = Math.max(0, Math.min(clampedActive === idx ? idx - 1 : clampedActive, next.length - 1));
    updateAttributes({ tabs: next, activeIndex: nextActive });
  }

  return (
    <NodeViewWrapper className="pf-code-tabs" data-testid="code-tabs">
      <div className="pf-code-tabs__bar" contentEditable={false}>
        <div className="pf-code-tabs__tabs" role="tablist" aria-label="Code languages">
          {tabs.map((t, idx) => {
            const activeTab = idx === clampedActive;
            const label =
              LANGUAGE_OPTIONS.find((o) => o.value === normalizeLanguage(t.language))?.label ||
              (t.language ? t.language : "Text");
            return (
              <button
                key={t.id || String(idx)}
                type="button"
                className={activeTab ? "pf-code-tabs__tab pf-code-tabs__tab--active" : "pf-code-tabs__tab"}
                onClick={() => setActive(idx)}
              >
                <span className="pf-code-tabs__tabLabel">{label}</span>
                {editable && tabs.length > 1 ? (
                  <span
                    className="pf-code-tabs__tabX"
                    role="button"
                    aria-label="Remove tab"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      removeTab(idx);
                    }}
                  >
                    ×
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {editable ? (
          <div className="pf-code-tabs__actions">
            <button type="button" className="pf-code-tabs__add" onClick={addTab}>
              + Tab
            </button>
          </div>
        ) : null}
      </div>

      <div className="pf-code-tabs__body" contentEditable={false}>
        <div className="pf-code-tabs__meta">
          <label className="pf-code-tabs__label">
            Language
            <select
              className="pf-code-tabs__select"
              value={normalizeLanguage(active?.language || "text")}
              onChange={(e) => setLanguage(clampedActive, e.target.value)}
              disabled={!editable}
            >
              {LANGUAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <div className="pf-code-tabs__hint">Use tabs for the same solution in multiple languages.</div>
        </div>

        <textarea
          className="pf-code-tabs__textarea"
          value={active?.code || ""}
          onChange={(e) => setCode(clampedActive, e.target.value)}
          placeholder="Paste your solution here…"
          spellCheck={false}
          disabled={!editable}
        />
      </div>
    </NodeViewWrapper>
  );
}

export function extractCodeTabsFromMarkdown(text: string): CodeTab[] | null {
  // If the paste is ONLY multiple fenced code blocks, convert into tabbed code.
  const re = /```([^\n]*)\n([\s\S]*?)\n```/g;
  const matches: { info: string; code: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    matches.push({ info: m[1] || "", code: m[2] || "" });
  }
  if (matches.length < 2) return null;
  const remainder = text.replace(re, "").trim();
  if (remainder) return null;

  return matches.map((x) => ({
    id: newId(),
    language: normalizeLanguage(x.info),
    code: x.code.replace(/\s+$/g, ""),
  }));
}

export const CodeTabs = Node.create({
  name: "codeTabs",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      tabs: {
        default: [{ id: "tab-1", language: "cpp", code: "" }],
      },
      activeIndex: {
        default: 0,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-code-tabs="true"]',
        getAttrs: (el) => {
          const element = el as HTMLElement;
          const tabs = safeJsonParse(element.getAttribute("data-tabs"));
          const activeIndex = Number(element.getAttribute("data-active"));
          return {
            tabs: Array.isArray(tabs) ? tabs : undefined,
            activeIndex: Number.isFinite(activeIndex) ? activeIndex : undefined,
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-code-tabs": "true",
        "data-tabs": JSON.stringify(node.attrs.tabs || []),
        "data-active": String(node.attrs.activeIndex ?? 0),
      }),
    ];
  },

  addCommands() {
    return {
      insertCodeTabs:
        (attrs?: { tabs?: CodeTab[]; activeIndex?: number }) =>
        ({ commands }: any) => {
          const tabs = Array.isArray(attrs?.tabs) && attrs!.tabs!.length
            ? attrs!.tabs!
            : [{ id: newId(), language: "cpp", code: "" }];
          const activeIndex = typeof attrs?.activeIndex === "number" ? attrs!.activeIndex! : 0;
          return commands.insertContent({ type: this.name, attrs: { tabs, activeIndex } });
        },
    } as any;
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeTabsView);
  },
});

"use client";

import * as React from "react";

import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

const LANGS: { value: string; label: string }[] = [
  { value: "", label: "Auto" },
  { value: "cpp", label: "C++" },
  { value: "go", label: "Go" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "typescript", label: "TypeScript" },
  { value: "javascript", label: "JavaScript" },
  { value: "sql", label: "SQL" },
  { value: "text", label: "Text" },
];

function CodeBlockView(props: any) {
  const { node, updateAttributes, editor, getPos } = props;
  const editable = editor?.isEditable ?? true;
  const language = (node?.attrs?.language ?? "") as string;

  function convertToTabs() {
    const pos = typeof getPos === "function" ? getPos() : null;
    if (typeof pos !== "number") return;

    const from = pos;
    const to = pos + node.nodeSize;
    const code = node.textContent || "";

    editor.commands.insertContentAt(
      { from, to },
      {
        type: "codeTabs",
        attrs: {
          tabs: [
            {
              id: `tab_${Date.now()}`,
              language: language || "text",
              code,
            },
          ],
          activeIndex: 0,
        },
      },
    );
  }

  return (
    <NodeViewWrapper className="pf-codeblock">
      <div className="pf-codeblock__bar" contentEditable={false}>
        <div className="pf-codeblock__left">
          <span className="pf-codeblock__kicker">Code</span>
          <select
            className="pf-codeblock__select"
            value={language}
            onChange={(e) => updateAttributes({ language: e.target.value })}
            disabled={!editable}
            aria-label="Language"
          >
            {LANGS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        {editable ? (
          <div className="pf-codeblock__right">
            <button type="button" className="pf-codeblock__btn" onClick={convertToTabs}>
              Tabs
            </button>
          </div>
        ) : null}
      </div>

      <pre className="pf-codeblock__pre">
        <NodeViewContent className="pf-codeblock__code" />
      </pre>
    </NodeViewWrapper>
  );
}

export const CodeBlockWithToolbar = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});

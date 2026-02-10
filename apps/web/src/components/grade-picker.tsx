"use client";

import * as React from "react";

import { gradeHint, gradeTone } from "@/lib/grades";

export function GradeLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--muted)]">
      <span className="inline-flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[rgba(251,113,133,.75)]" /> 0 fail
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[rgba(249,115,22,.75)]" /> 1 hints
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[rgba(251,191,36,.8)]" /> 2 shaky
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[rgba(45,212,191,.82)]" /> 3 solid
      </span>
      <span className="inline-flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full bg-[rgba(52,211,153,.8)]" /> 4 ace
      </span>
      <span className="ml-auto hidden sm:inline">Hover a grade for the rubric.</span>
    </div>
  );
}

export function GradePicker(props: {
  value: number;
  onChange: (g: number) => void;
  disabled?: boolean;
}) {
  const { value, onChange, disabled } = props;

  return (
    <div className="flex items-center gap-2">
      {[0, 1, 2, 3, 4].map((g) => {
        const selected = value === g;
        return (
          <button
            key={g}
            type="button"
            onClick={() => onChange(g)}
            disabled={disabled}
            title={gradeHint(g)}
            className={[
              "h-9 w-9 rounded-full border text-sm font-semibold transition disabled:opacity-60",
              "shadow-[0_10px_22px_rgba(16,24,40,.06)]",
              gradeTone(g),
              selected ? "ring-4 ring-[color:var(--pf-ring)]" : "",
              "focus:outline-none focus:ring-4 focus:ring-[color:var(--pf-ring-focus)]",
            ].join(" ")}
          >
            {g}
          </button>
        );
      })}
    </div>
  );
}

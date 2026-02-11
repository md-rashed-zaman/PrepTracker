"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ProblemWithState } from "@/lib/types";
import { GradeLegend, GradePicker } from "@/components/grade-picker";
import { difficultyChip } from "@/lib/presentation";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toDatetimeLocalValue(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function daysFromNowISO(iso: string) {
  const due = new Date(iso).getTime();
  const now = Date.now();
  const ms = due - now;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function dueLabel(iso: string) {
  const d = daysFromNowISO(iso);
  if (d < 0) return { label: "Overdue", tone: "border-[rgba(180,35,24,.28)] bg-[rgba(180,35,24,.08)]" };
  if (d === 0) return { label: "Due today", tone: "border-[rgba(161,98,7,.28)] bg-[rgba(161,98,7,.08)]" };
  return { label: `Due in ${d}d`, tone: "border-[rgba(15,118,110,.28)] bg-[rgba(15,118,110,.08)]" };
}

export default function TodayPage() {
  const [items, setItems] = React.useState<ProblemWithState[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [minutesByID, setMinutesByID] = React.useState<Record<string, string>>({});
  const [reviewedAtByID, setReviewedAtByID] = React.useState<Record<string, string>>({});
  const [gradeByID, setGradeByID] = React.useState<Record<string, number>>({});

  async function load() {
    setError(null);
    const resp = await fetch("/api/reviews/due?window_days=14", { cache: "no-store" });
    if (!resp.ok) {
      setError("Failed to load due items");
      return;
    }
    const data = (await resp.json().catch(() => null)) as unknown;
    if (!Array.isArray(data)) {
      setItems([]);
      return;
    }
    setItems(data as ProblemWithState[]);
  }

  React.useEffect(() => {
    void load();
  }, []);

  React.useEffect(() => {
    // Seed default reviewed_at for visible items without clobbering user edits.
    setReviewedAtByID((prev) => {
      const next = { ...prev };
      const nowVal = toDatetimeLocalValue(new Date());
      for (const p of items) {
        if (!next[p.id]) next[p.id] = nowVal;
      }
      return next;
    });
  }, [items]);

  React.useEffect(() => {
    // Seed a default grade selection.
    setGradeByID((prev) => {
      const next = { ...prev };
      for (const p of items) {
        if (typeof next[p.id] !== "number") next[p.id] = 3;
      }
      return next;
    });
  }, [items]);

  async function postReview(problemID: string) {
    setBusy(problemID);
    try {
      const grade = gradeByID[problemID];
      if (typeof grade !== "number" || grade < 0 || grade > 4) {
        setError("Pick a grade (0-4) first.");
        return;
      }
      const rawMin = (minutesByID[problemID] || "").trim();
      const min = rawMin ? Number(rawMin) : 0;
      const timeSpentSec = Number.isFinite(min) && min > 0 ? Math.round(min * 60) : undefined;
      const rawReviewedAt = (reviewedAtByID[problemID] || "").trim();
      const reviewedAtISO = rawReviewedAt ? new Date(rawReviewedAt).toISOString() : undefined;
      const resp = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          problem_id: problemID,
          grade,
          source: "web",
          ...(timeSpentSec ? { time_spent_sec: timeSpentSec } : {}),
          ...(reviewedAtISO ? { reviewed_at: reviewedAtISO } : {}),
        }),
      });
      if (!resp.ok) {
        const msg = (await resp.json().catch(() => null))?.error || "Failed to save review";
        setError(String(msg));
        return;
      }
      setMinutesByID((m) => {
        const next = { ...m };
        delete next[problemID];
        return next;
      });
      setReviewedAtByID((m) => ({
        ...m,
        [problemID]: toDatetimeLocalValue(new Date()),
      }));
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <div className="pf-kicker">Today</div>
          <CardTitle>Due reviews</CardTitle>
          <CardDescription>Quick-grade your recalls to keep the schedule honest.</CardDescription>
        </div>
        <Button variant="outline" onClick={load}>
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-3">
          <GradeLegend />
        </div>
        {error ? (
          <div className="rounded-2xl border border-[rgba(180,35,24,.28)] bg-[rgba(180,35,24,.08)] px-4 py-3 text-sm">
            {error}
          </div>
        ) : null}
        {items.length === 0 ? (
          <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-6 text-sm text-[color:var(--muted)]">
            Nothing due in the next two weeks. Add problems in Library.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((p) => {
              const dueAt = p.state?.due_at;
              const chip = dueAt ? dueLabel(dueAt) : null;
              const diff = difficultyChip(p.difficulty || "");
              return (
                <div
                  key={p.id}
                  className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--pf-surface)] p-4 shadow-[0_12px_28px_rgba(16,24,40,.06)]"
                >
                  <div className="space-y-3">
                    <div className="min-w-0">
                      <div className="pf-display text-lg font-semibold leading-tight">
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline decoration-[rgba(15,118,110,.28)] underline-offset-4 hover:decoration-[rgba(15,118,110,.55)]"
                        >
                          <span className="block truncate">{p.title || p.url}</span>
                        </a>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[color:var(--muted)]">
                        {p.platform ? <span>{p.platform}</span> : null}
                        {diff ? <Badge className={diff.tone}>{diff.label}</Badge> : null}
                        {chip ? <Badge className={chip.tone}>{chip.label}</Badge> : null}
                      </div>
                    </div>

                    <div className="grid gap-2 lg:grid-cols-[110px_minmax(0,1fr)_auto] lg:items-center">
                      <Input
                        className="h-9 w-full rounded-full"
                        inputMode="decimal"
                        placeholder="min"
                        value={minutesByID[p.id] || ""}
                        onChange={(e) =>
                          setMinutesByID((m) => ({
                            ...m,
                            [p.id]: e.target.value,
                          }))
                        }
                        title="Optional time spent (minutes)"
                      />

                      <div className="flex min-w-0 items-center gap-2">
                        <Input
                          className="h-9 w-full min-w-0 rounded-full"
                          type="datetime-local"
                          value={reviewedAtByID[p.id] || ""}
                          onChange={(e) =>
                            setReviewedAtByID((m) => ({
                              ...m,
                              [p.id]: e.target.value,
                            }))
                          }
                          title="Reviewed at (local time)"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setReviewedAtByID((m) => ({
                              ...m,
                              [p.id]: toDatetimeLocalValue(new Date()),
                            }))
                          }
                          disabled={busy === p.id}
                          title="Set reviewed time to now"
                          className="h-9 shrink-0 rounded-full px-3"
                        >
                          Now
                        </Button>
                      </div>

                      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 lg:w-auto">
                        <div className="min-w-0">
                          <GradePicker
                            value={gradeByID[p.id] ?? 3}
                            onChange={(g) =>
                              setGradeByID((m) => ({
                                ...m,
                                [p.id]: g,
                              }))
                            }
                            disabled={busy === p.id}
                          />
                        </div>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => postReview(p.id)}
                          disabled={busy === p.id}
                          title="Confirm and log this review"
                          className="h-9 rounded-full px-4"
                        >
                          Confirm
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

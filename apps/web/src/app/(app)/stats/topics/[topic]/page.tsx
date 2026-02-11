"use client";

import Link from "next/link";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ProblemWithState } from "@/lib/types";
import { difficultyChip } from "@/lib/presentation";

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function masteryScore(reps: number, ease: number, overdueDays: number) {
  const overduePenalty = Math.min(30, overdueDays * 2);
  const m = 20 * Math.log2(reps + 1) + 25 * (ease - 1.3) - overduePenalty;
  return clamp(m, 0, 100);
}

function daysFromNowISO(iso: string) {
  const due = new Date(iso).getTime();
  const now = Date.now();
  return Math.floor((due - now) / (1000 * 60 * 60 * 24));
}

function dueChip(iso?: string) {
  if (!iso) return null;
  const d = daysFromNowISO(iso);
  if (d < 0) return { label: "Overdue", tone: "border-[rgba(251,113,133,.28)] bg-[rgba(251,113,133,.10)]" };
  if (d === 0) return { label: "Due today", tone: "border-[rgba(251,191,36,.28)] bg-[rgba(251,191,36,.10)]" };
  return { label: `Due in ${d}d`, tone: "border-[rgba(45,212,191,.28)] bg-[rgba(45,212,191,.10)]" };
}

export default function TopicStatsPage(props: { params: Promise<{ topic: string }> }) {
  const [topic, setTopic] = React.useState<string>("");

  const [items, setItems] = React.useState<ProblemWithState[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState<"due" | "mastery" | "title">("due");

  React.useEffect(() => {
    void (async () => {
      const { topic } = await props.params;
      setTopic(decodeURIComponent(topic || ""));
    })();
  }, [props.params]);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch("/api/problems", { cache: "no-store" });
      if (!resp.ok) {
        setError("Failed to load problems");
        setItems([]);
        return;
      }
      const data = (await resp.json().catch(() => null)) as unknown;
      setItems(Array.isArray(data) ? (data as ProblemWithState[]) : []);
    } finally {
      setBusy(false);
    }
  }

  React.useEffect(() => {
    void load();
  }, []);

  const rows = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const topicNeedle = topic.trim().toLowerCase();
    if (!topicNeedle) return [];

    const now = Date.now();
    const filtered = items
      .filter((p) => (p.state?.is_active ?? true) === true)
      .filter((p) => (p.topics || []).some((t) => (t || "").toLowerCase() === topicNeedle))
      .filter((p) => {
        if (!needle) return true;
        const hay = `${p.title || ""} ${p.url || ""} ${(p.platform || "").toLowerCase()}`.toLowerCase();
        return hay.includes(needle);
      })
      .map((p) => {
        const dueAt = p.state?.due_at || "";
        const overdueDays = dueAt ? Math.max(0, Math.floor((now - new Date(dueAt).getTime()) / (1000 * 60 * 60 * 24))) : 0;
        const mastery = masteryScore(p.state?.reps || 0, p.state?.ease || 2.5, overdueDays);
        return { p, mastery };
      });

    filtered.sort((a, b) => {
      if (sort === "title") return String(a.p.title || a.p.url).localeCompare(String(b.p.title || b.p.url));
      if (sort === "mastery") return b.mastery - a.mastery;
      // sort === "due"
      const ad = new Date(a.p.state?.due_at || 0).getTime();
      const bd = new Date(b.p.state?.due_at || 0).getTime();
      if (ad !== bd) return ad - bd;
      return b.mastery - a.mastery;
    });

    return filtered;
  }, [items, q, topic, sort]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex-wrap items-start gap-3">
          <div className="min-w-0">
            <div className="pf-kicker">Stats</div>
            <CardTitle className="truncate">
              Topic: <span className="capitalize">{topic || "…"}</span>
            </CardTitle>
            <CardDescription>
              Drilldown view. Sorted by <span className="font-medium">{sort}</span>. Click a problem to open it on the platform.
            </CardDescription>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            <Button asChild variant="outline">
              <Link href="/stats">Back to Stats</Link>
            </Button>
            <Button variant="outline" onClick={load} disabled={busy}>
              Refresh
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex-wrap items-end gap-3">
          <div>
            <div className="pf-kicker">Problems</div>
            <CardTitle>Topic set</CardTitle>
            <CardDescription>Search within this topic, then scan mastery and due pressure.</CardDescription>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
            <Input
              placeholder="Search title, URL, platform…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 w-full rounded-full sm:w-[320px]"
            />
            <div className="inline-flex rounded-full border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] p-1">
              {([
                { key: "due", label: "Due" },
                { key: "mastery", label: "Mastery" },
                { key: "title", label: "Title" },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setSort(t.key)}
                  className={[
                    "px-3 py-2 text-xs font-semibold rounded-full transition",
                    sort === t.key
                      ? "bg-[color:var(--pf-surface-strong)] shadow-[0_10px_22px_rgba(16,24,40,.06)]"
                      : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
                  ].join(" ")}
                  aria-label={`Sort by ${t.label}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-2xl border border-[rgba(180,35,24,.28)] bg-[rgba(180,35,24,.08)] px-4 py-3 text-sm">
              {error}
            </div>
          ) : null}

          {!topic ? (
            <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-8 text-sm text-[color:var(--muted)]">
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-8 text-sm text-[color:var(--muted)]">
              No problems found for this topic.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--muted)]">
                <span>{rows.length} problems</span>
                <Link href="/library" className="underline underline-offset-4 hover:opacity-90">
                  Manage in Library
                </Link>
              </div>

              {/* Desktop table */}
              <div className="hidden md:block">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-[color:var(--muted)]">
                        <th className="py-2 pr-4">Problem</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2 pr-4">Mastery</th>
                        <th className="py-2 pr-4">State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ p, mastery }) => {
                        const diff = difficultyChip(p.difficulty || "");
                        const due = dueChip(p.state?.due_at);
                        return (
                          <tr key={p.id} className="border-t border-[color:var(--line)] hover:bg-[color:var(--pf-surface-weak)]">
                            <td className="py-3 pr-4 align-top">
                              <div className="min-w-[260px]">
                                <a
                                  href={p.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="pf-display block font-semibold underline decoration-[rgba(45,212,191,.22)] underline-offset-4 hover:decoration-[rgba(45,212,191,.5)]"
                                >
                                  {p.title || p.url}
                                </a>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[color:var(--muted)]">
                                  {p.platform ? <span>{p.platform}</span> : null}
                                  {diff ? <Badge className={diff.tone}>{diff.label}</Badge> : null}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 pr-4 align-top">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                {due ? <Badge className={due.tone}>{due.label}</Badge> : null}
                                <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">
                                  interval {p.state?.interval_days ?? 1}d
                                </Badge>
                              </div>
                            </td>
                            <td className="py-3 pr-4 align-top">
                              <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">
                                {Math.round(mastery)}
                              </Badge>
                            </td>
                            <td className="py-3 pr-4 align-top">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">
                                  reps {p.state?.reps ?? 0}
                                </Badge>
                                <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">
                                  ease {(p.state?.ease ?? 2.5).toFixed(2)}
                                </Badge>
                                <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">
                                  last {(p.state as any)?.last_grade ?? "—"}
                                </Badge>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile cards */}
              <div className="space-y-2 md:hidden">
                {rows.map(({ p, mastery }) => {
                  const diff = difficultyChip(p.difficulty || "");
                  const due = dueChip(p.state?.due_at);
                  return (
                    <div
                      key={p.id}
                      className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--pf-surface)] p-4 shadow-[0_12px_28px_rgba(16,24,40,.06)]"
                    >
                      <div className="min-w-0">
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="pf-display block text-base font-semibold leading-tight underline decoration-[rgba(45,212,191,.22)] underline-offset-4 hover:decoration-[rgba(45,212,191,.5)]"
                        >
                          {p.title || p.url}
                        </a>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[color:var(--muted)]">
                          {p.platform ? <span>{p.platform}</span> : null}
                          {diff ? <Badge className={diff.tone}>{diff.label}</Badge> : null}
                          {due ? <Badge className={due.tone}>{due.label}</Badge> : null}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">
                            mastery {Math.round(mastery)}
                          </Badge>
                          <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">
                            reps {p.state?.reps ?? 0}
                          </Badge>
                          <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">
                            interval {p.state?.interval_days ?? 1}d
                          </Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

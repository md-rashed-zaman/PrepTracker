"use client";

import * as React from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { difficultyChip } from "@/lib/presentation";
import type { ContestStatsResponse, ProblemWithState, StatsOverview, TopicStat } from "@/lib/types";

function Metric({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] p-4 shadow-[0_10px_22px_rgba(16,24,40,.05)]">
      <div className="text-xs text-[color:var(--muted)]">{label}</div>
      <div className="pf-display mt-2 text-2xl font-semibold leading-tight">{value}</div>
      {hint ? <div className="mt-1 text-xs text-[color:var(--muted)]">{hint}</div> : null}
    </div>
  );
}

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

function fmtMinutes(totalSec: number) {
  if (!Number.isFinite(totalSec) || totalSec <= 0) return "—";
  return `${Math.round(totalSec / 60)}m`;
}

export default function StatsPage() {
  const [overview, setOverview] = React.useState<StatsOverview | null>(null);
  const [topics, setTopics] = React.useState<TopicStat[]>([]);
  const [library, setLibrary] = React.useState<ProblemWithState[]>([]);
  const [activeTopic, setActiveTopic] = React.useState<string>("");
  const [topicQ, setTopicQ] = React.useState("");
  const [topicSort, setTopicSort] = React.useState<"due" | "mastery" | "title">("due");
  const [topicListQ, setTopicListQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [panel, setPanel] = React.useState<"topics" | "contests">("topics");
  const [contestStats, setContestStats] = React.useState<ContestStatsResponse | null>(null);
  const [contestWindow, setContestWindow] = React.useState<7 | 30 | 90>(30);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const [o, t] = await Promise.all([
        fetch("/api/stats/overview", { cache: "no-store" }),
        fetch("/api/stats/topics", { cache: "no-store" }),
      ]);
      if (!o.ok) {
        setError("Failed to load stats overview");
        return;
      }
      const ov = (await o.json().catch(() => null)) as unknown;
      setOverview(ov && typeof ov === "object" ? (ov as StatsOverview) : null);
      if (t.ok) {
        const td = (await t.json().catch(() => null)) as unknown;
        setTopics(Array.isArray(td) ? (td as TopicStat[]) : []);
      } else {
        setTopics([]);
      }
    } finally {
      setBusy(false);
    }
  }

  async function loadContestStats(windowDays: number) {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/stats/contests?window_days=${encodeURIComponent(String(windowDays))}`, { cache: "no-store" });
      if (!resp.ok) {
        setError("Failed to load contest stats");
        return;
      }
      const data = (await resp.json().catch(() => null)) as unknown;
      setContestStats(data && typeof data === "object" ? (data as ContestStatsResponse) : null);
    } finally {
      setBusy(false);
    }
  }

  async function ensureLibraryLoaded() {
    if (library.length > 0) return;
    const resp = await fetch("/api/problems", { cache: "no-store" });
    if (!resp.ok) return;
    const data = (await resp.json().catch(() => null)) as unknown;
    setLibrary(Array.isArray(data) ? (data as ProblemWithState[]) : []);
  }

  React.useEffect(() => {
    void load();
  }, []);

  React.useEffect(() => {
    if (panel !== "contests") return;
    void loadContestStats(contestWindow);
  }, [panel, contestWindow]);

  React.useEffect(() => {
    if (panel !== "topics") return;
    if (!activeTopic) return;
    void ensureLibraryLoaded();
  }, [panel, activeTopic]);

  const desktopTopicProblems = React.useMemo(() => {
    const needle = activeTopic.trim().toLowerCase();
    if (!needle) return [];
    const q = topicQ.trim().toLowerCase();
    const now = Date.now();
    const rows = library
      .filter((p) => (p.state?.is_active ?? true) === true)
      .filter((p) => (p.topics || []).some((t) => (t || "").toLowerCase() === needle))
      .filter((p) => {
        if (!q) return true;
        const hay = `${p.title || ""} ${p.url || ""} ${(p.platform || "").toLowerCase()}`.toLowerCase();
        return hay.includes(q);
      })
      .map((p) => {
        const dueAt = p.state?.due_at || "";
        const overdueDays = dueAt ? Math.max(0, Math.floor((now - new Date(dueAt).getTime()) / (1000 * 60 * 60 * 24))) : 0;
        const mastery = masteryScore(p.state?.reps || 0, p.state?.ease || 2.5, overdueDays);
        return { p, mastery };
      });

    rows.sort((a, b) => {
      if (topicSort === "title") return String(a.p.title || a.p.url).localeCompare(String(b.p.title || b.p.url));
      if (topicSort === "mastery") return b.mastery - a.mastery;
      const ad = new Date(a.p.state?.due_at || 0).getTime();
      const bd = new Date(b.p.state?.due_at || 0).getTime();
      if (ad !== bd) return ad - bd;
      return b.mastery - a.mastery;
    });
    return rows;
  }, [library, activeTopic, topicQ, topicSort]);

  const filteredTopics = React.useMemo(() => {
    const q = topicListQ.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter((t) => String(t.topic || "").toLowerCase().includes(q));
  }, [topics, topicListQ]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div>
            <div className="pf-kicker">Stats</div>
            <CardTitle>Stats</CardTitle>
            <CardDescription>Overview metrics stay pinned. Use tabs to explore Topics or Contests.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] p-1">
              {([
                { key: "topics", label: "Topics" },
                { key: "contests", label: "Contests" },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setPanel(t.key)}
                  className={[
                    "px-3 py-2 text-xs font-semibold rounded-full transition",
                    panel === t.key
                      ? "bg-[color:var(--pf-surface-strong)] shadow-[0_10px_22px_rgba(16,24,40,.06)]"
                      : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
                  ].join(" ")}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              onClick={() => {
                if (panel === "contests") void loadContestStats(contestWindow);
                void load();
              }}
              disabled={busy}
            >
              Refresh
            </Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <div className="pf-kicker">Overview</div>
            <CardTitle>Progress signals</CardTitle>
            <CardDescription>Overdue pressure, daily cadence, and short-term workload.</CardDescription>
          </div>
          <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">v1</Badge>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-2xl border border-[rgba(180,35,24,.28)] bg-[rgba(180,35,24,.08)] px-4 py-3 text-sm">
              {error}
            </div>
          ) : null}
          {!overview ? (
            <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-8 text-sm text-[color:var(--muted)]">
              Loading stats…
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              <Metric label="Active problems" value={overview.active_problems} />
              <Metric label="Overdue" value={overview.overdue_count} hint="Should be near zero most days." />
              <Metric label="Due today" value={overview.due_today_count} />
              <Metric label="Due soon" value={overview.due_soon_count} hint="Next 3 days (excluding today)." />
              <Metric label="Reviews (7d)" value={overview.reviews_last_7_days} />
              <Metric label="Current streak" value={`${overview.current_streak_days}d`} hint="Days with at least one review." />
            </div>
          )}
        </CardContent>
      </Card>

      {panel === "topics" ? (
        <div className="space-y-5">
          {/* Mobile: topic links navigate to the dedicated drilldown page */}
          <Card className="lg:hidden">
            <CardHeader>
              <div>
                <div className="pf-kicker">Topics</div>
                <CardTitle>Mastery by topic</CardTitle>
                <CardDescription>Tap a topic to see the full list.</CardDescription>
              </div>
              <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">{topics.length} topics</Badge>
            </CardHeader>
            <CardContent>
              {topics.length === 0 ? (
                <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-8 text-sm text-[color:var(--muted)]">
                  Add topics to problems to see breakdowns.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-[color:var(--muted)]">
                        <th className="py-2 pr-4">Topic</th>
                        <th className="py-2 pr-4">Problems</th>
                        <th className="py-2 pr-4">Mastery avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topics.map((t) => (
                        <tr key={t.topic} className="border-t border-[color:var(--line)] hover:bg-[color:var(--pf-surface-weak)]">
                          <td className="py-3 pr-4">
                            <Link
                              href={`/stats/topics/${encodeURIComponent(t.topic)}`}
                              className="pf-display font-semibold capitalize underline decoration-[rgba(45,212,191,.22)] underline-offset-4 hover:decoration-[rgba(45,212,191,.5)]"
                              title="View problems in this topic"
                            >
                              {t.topic}
                            </Link>
                          </td>
                          <td className="py-3 pr-4 text-[color:var(--muted)]">{t.count}</td>
                          <td className="py-3 pr-4">
                            <Badge className="border-[rgba(45,212,191,.28)] bg-[rgba(45,212,191,.10)]">
                              {t.mastery_avg}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Desktop: 2-panel drilldown (no modal) */}
          <div className="hidden gap-5 lg:grid lg:grid-cols-[420px_1fr]">
            <Card>
              <CardHeader className="flex-wrap items-end gap-3">
                <div className="min-w-0">
                  <div className="pf-kicker">Topics</div>
                  <CardTitle>Mastery by topic</CardTitle>
                  <CardDescription>Click a topic to preview its problems.</CardDescription>
                </div>
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <Input
                    placeholder="Search topics…"
                    value={topicListQ}
                    onChange={(e) => setTopicListQ(e.target.value)}
                    className="h-9 w-full rounded-full sm:w-[220px]"
                  />
                  <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">{topics.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {filteredTopics.length === 0 ? (
                  <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-8 text-sm text-[color:var(--muted)]">
                    No topics match your search.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-[color:var(--muted)]">
                          <th className="py-2 pr-4">Topic</th>
                          <th className="py-2 pr-4">Count</th>
                          <th className="py-2 pr-4">Avg</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTopics.map((t) => {
                          const selected = activeTopic.trim().toLowerCase() === String(t.topic || "").trim().toLowerCase();
                          return (
                            <tr
                              key={t.topic}
                              className={[
                                "border-t border-[color:var(--line)]",
                                "hover:bg-[color:var(--pf-surface-weak)]",
                                selected ? "bg-[rgba(15,118,110,.06)]" : "",
                              ].join(" ")}
                            >
                              <td className="py-3 pr-4">
                                <button
                                  type="button"
                                  onClick={() => setActiveTopic(t.topic)}
                                  className="pf-display font-semibold capitalize underline decoration-[rgba(45,212,191,.18)] underline-offset-4 hover:decoration-[rgba(45,212,191,.45)]"
                                  title="Show in the right panel"
                                >
                                  {t.topic}
                                </button>
                                <div className="mt-1 text-[11px] text-[color:var(--muted)]">
                                  <Link
                                    href={`/stats/topics/${encodeURIComponent(t.topic)}`}
                                    className="underline underline-offset-4 hover:opacity-90"
                                    title="Open full drilldown page"
                                  >
                                    Open
                                  </Link>
                                </div>
                              </td>
                              <td className="py-3 pr-4 text-[color:var(--muted)]">{t.count}</td>
                              <td className="py-3 pr-4">
                                <Badge className="border-[rgba(45,212,191,.28)] bg-[rgba(45,212,191,.10)]">
                                  {t.mastery_avg}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-wrap items-end gap-3">
                <div className="min-w-0">
                  <div className="pf-kicker">Details</div>
                  <CardTitle>{activeTopic ? <span className="capitalize">{activeTopic}</span> : "Select a topic"}</CardTitle>
                  <CardDescription>
                    {activeTopic ? "Scan due pressure and mastery, then click through to practice." : "Pick a topic on the left to see problems here."}
                  </CardDescription>
                </div>
                {activeTopic ? (
                  <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                    <Input
                      placeholder="Search problems…"
                      value={topicQ}
                      onChange={(e) => setTopicQ(e.target.value)}
                      className="h-9 w-full rounded-full sm:w-[260px]"
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
                          onClick={() => setTopicSort(t.key)}
                          className={[
                            "px-3 py-2 text-xs font-semibold rounded-full transition",
                            topicSort === t.key
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
                ) : null}
              </CardHeader>
              <CardContent>
                {!activeTopic ? (
                  <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-8 text-sm text-[color:var(--muted)]">
                    Select a topic to view problems.
                  </div>
                ) : desktopTopicProblems.length === 0 ? (
                  <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-8 text-sm text-[color:var(--muted)]">
                    No problems found for this topic.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {desktopTopicProblems.map(({ p, mastery }) => {
                      const chip = dueChip(p.state?.due_at);
                      const diff = difficultyChip(p.difficulty || "");
                      return (
                        <div
                          key={p.id}
                          className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--pf-surface)] p-4 shadow-[0_12px_28px_rgba(16,24,40,.06)]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-[240px]">
                              <div className="pf-display text-base font-semibold leading-tight">
                                <a
                                  href={p.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline decoration-[rgba(45,212,191,.22)] underline-offset-4 hover:decoration-[rgba(45,212,191,.5)]"
                                >
                                  {p.title || p.url}
                                </a>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[color:var(--muted)]">
                                {p.platform ? <span>{p.platform}</span> : null}
                                {diff ? <Badge className={diff.tone}>{diff.label}</Badge> : null}
                                {chip ? <Badge className={chip.tone}>{chip.label}</Badge> : null}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">
                                mastery {Math.round(mastery)}
                              </Badge>
                              <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">reps {p.state?.reps ?? 0}</Badge>
                              <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">
                                ease {(p.state?.ease ?? 2.5).toFixed(2)}
                              </Badge>
                              <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">
                                interval {p.state?.interval_days ?? 1}d
                              </Badge>
                              <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">
                                last {(p.state as any)?.last_grade ?? "—"}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <Card>
          <CardHeader>
            <div>
              <div className="pf-kicker">Contests</div>
              <CardTitle>Contest pulse</CardTitle>
              <CardDescription>Based on recorded contest results (per-problem Confirm).</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {([7, 30, 90] as const).map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={contestWindow === d ? "primary" : "outline"}
                  onClick={() => setContestWindow(d)}
                  disabled={busy}
                >
                  {d}d
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {!contestStats ? (
              <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-8 text-sm text-[color:var(--muted)]">
                Loading contest stats…
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <Metric label={`Contests finished (${contestStats.window_days}d)`} value={contestStats.totals.contests_finished} />
                  <Metric label="Problems recorded" value={contestStats.totals.problems_recorded} hint="Each Confirm creates/updates a contest result." />
                  <Metric
                    label="Solved rate"
                    value={
                      contestStats.totals.problems_recorded
                        ? `${Math.round((contestStats.totals.solved_count / contestStats.totals.problems_recorded) * 100)}%`
                        : "—"
                    }
                  />
                  <Metric label="Avg grade" value={contestStats.totals.avg_grade != null ? contestStats.totals.avg_grade.toFixed(1) : "—"} />
                  <Metric label="Time recorded" value={fmtMinutes(contestStats.totals.total_time_sec)} hint="From the minutes field (if provided)." />
                  <Metric label="Solved (count)" value={contestStats.totals.solved_count} />
                </div>

                <div className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--pf-surface)] p-4 shadow-[0_12px_28px_rgba(16,24,40,.06)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="pf-display text-sm font-semibold">Daily recorded problems</div>
                      <div className="mt-1 text-xs text-[color:var(--muted)]">Last {contestStats.window_days} days</div>
                    </div>
                    <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">
                      max{" "}
                      {Math.max(0, ...contestStats.days.map((d) => d.problems_recorded))}
                    </Badge>
                  </div>
                  {contestStats.days.length === 0 ? null : (
                    <div className="mt-3">
                      <div className="flex h-16 items-end gap-1">
                        {(() => {
                          const max = Math.max(1, ...contestStats.days.map((d) => d.problems_recorded));
                          return contestStats.days.map((d) => {
                            const h = Math.max(2, Math.round((d.problems_recorded / max) * 64));
                            const tone = d.problems_recorded === 0 ? "bg-[rgba(16,24,40,.08)]" : "bg-[rgba(15,118,110,.35)]";
                            return (
                              <div
                                key={d.date}
                                className={`flex-1 rounded-md ${tone}`}
                                style={{ height: `${h}px` }}
                                title={`${d.date} • recorded ${d.problems_recorded} • solved ${d.solved_count}`}
                              />
                            );
                          });
                        })()}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[10px] text-[color:var(--muted)]">
                        <span>{contestStats.days[0]?.date}</span>
                        <span>{contestStats.days[contestStats.days.length - 1]?.date}</span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--pf-surface)] p-4 shadow-[0_12px_28px_rgba(16,24,40,.06)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="pf-display text-sm font-semibold">Recent contests</div>
                      <div className="mt-1 text-xs text-[color:var(--muted)]">Finished sessions (most recent first).</div>
                    </div>
                    <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">{contestStats.recent.length}</Badge>
                  </div>
                  {contestStats.recent.length === 0 ? (
                    <div className="mt-3 rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-6 text-sm text-[color:var(--muted)]">
                      Finish a contest to see history here.
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {contestStats.recent.map((c) => (
                        <div
                          key={c.contest_id}
                          className="rounded-[18px] border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-[220px]">
                              <div className="pf-display text-sm font-semibold leading-tight">
                                {c.strategy} • {c.duration_minutes}m
                              </div>
                              <div className="mt-1 text-xs text-[color:var(--muted)]">
                                {c.completed_at ? new Date(c.completed_at).toLocaleString() : "—"}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">
                                Recorded {c.recorded_count}/{c.total_items}
                              </Badge>
                              <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">Solved {c.solved_count}</Badge>
                              <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">
                                Avg {c.avg_grade != null ? c.avg_grade.toFixed(1) : "—"}
                              </Badge>
                              <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">
                                Time {fmtMinutes(c.total_time_sec)}
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

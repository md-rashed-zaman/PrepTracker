"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProblemWithState } from "@/lib/types";
import { GradeLegend, GradePicker } from "@/components/grade-picker";
import { difficultyChip, normalizeDifficulty } from "@/lib/presentation";

function normalizeTopics(raw: string) {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function includesQuery(p: ProblemWithState, q: string) {
  if (!q) return true;
  const hay = [
    p.title,
    p.url,
    p.platform,
    p.difficulty,
    ...(p.topics || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q.toLowerCase());
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

export default function LibraryPage() {
  const [items, setItems] = React.useState<ProblemWithState[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const [url, setURL] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [platform, setPlatform] = React.useState("");
  const [difficulty, setDifficulty] = React.useState("");
  const [topics, setTopics] = React.useState("");
  const [logInitial, setLogInitial] = React.useState(false);
  const [initialGrade, setInitialGrade] = React.useState<number>(3);
  const [initialMinutes, setInitialMinutes] = React.useState<string>("");
  const [initialReviewedAt, setInitialReviewedAt] = React.useState<string>("");

  function pad2(n: number) {
    return String(n).padStart(2, "0");
  }
  function toDatetimeLocalValue(d: Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  const [query, setQuery] = React.useState("");
  const [difficultyFilter, setDifficultyFilter] = React.useState<"all" | "easy" | "medium" | "hard" | "unknown">("all");
  const [platformFilter, setPlatformFilter] = React.useState<string>("all");
  const [topicFilter, setTopicFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<"active" | "archived" | "all">("active");
  const [dueFilter, setDueFilter] = React.useState<"all" | "overdue" | "today" | "soon">("all");

  const [editOpen, setEditOpen] = React.useState(false);
  const [editID, setEditID] = React.useState<string>("");
  const [editURL, setEditURL] = React.useState<string>("");
  const [editTitle, setEditTitle] = React.useState<string>("");
  const [editPlatform, setEditPlatform] = React.useState<string>("");
  const [editDifficulty, setEditDifficulty] = React.useState<string>("");
  const [editTopics, setEditTopics] = React.useState<string>("");

  async function load() {
    setError(null);
    setLoading(true);
    const resp = await fetch("/api/problems", { cache: "no-store" });
    if (!resp.ok) {
      setError("Failed to load problems");
      setLoading(false);
      return;
    }
    const data = (await resp.json().catch(() => null)) as unknown;
    if (!Array.isArray(data)) {
      setItems([]);
      setLoading(false);
      return;
    }
    setItems(data as ProblemWithState[]);
    setLoading(false);
  }

  React.useEffect(() => {
    void load();
  }, []);

  React.useEffect(() => {
    // Default: keep filters expanded on small screens, collapsed on desktop.
    const key = "preptracker.library.filtersOpen";
    try {
      const saved = window.localStorage.getItem(key);
      if (saved === "1") setFiltersOpen(true);
      else if (saved === "0") setFiltersOpen(false);
      else setFiltersOpen(window.innerWidth < 768);
    } catch {
      setFiltersOpen(window.innerWidth < 768);
    }
  }, []);

  React.useEffect(() => {
    const key = "preptracker.library.filtersOpen";
    try {
      window.localStorage.setItem(key, filtersOpen ? "1" : "0");
    } catch {
      // ignore
    }
  }, [filtersOpen]);

  const platforms = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of items) {
      if (p.platform) set.add(p.platform);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const topicsList = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of items) {
      for (const t of p.topics || []) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = React.useMemo(() => {
    const q = query.trim();
    return items
      .filter((p) => {
        const active = p.state?.is_active ?? true;
        if (statusFilter === "active" && !active) return false;
        if (statusFilter === "archived" && active) return false;
        if (!includesQuery(p, q)) return false;

        const d = normalizeDifficulty(p.difficulty || "");
        if (difficultyFilter !== "all" && d !== difficultyFilter) return false;

        if (platformFilter !== "all" && (p.platform || "") !== platformFilter) return false;
        if (topicFilter !== "all" && !(p.topics || []).includes(topicFilter)) return false;

        if (dueFilter !== "all") {
          const dueAt = p.state?.due_at;
          if (!dueAt) return false;
          const dd = daysFromNowISO(dueAt);
          if (dueFilter === "overdue" && dd >= 0) return false;
          if (dueFilter === "today" && dd !== 0) return false;
          if (dueFilter === "soon" && !(dd > 0 && dd <= 3)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const ad = new Date(a.state?.due_at || 0).getTime();
        const bd = new Date(b.state?.due_at || 0).getTime();
        return ad - bd;
      });
  }, [items, query, difficultyFilter, platformFilter, topicFilter, statusFilter, dueFilter]);

  const activeFilters = React.useMemo(() => {
    const out: { key: string; label: string }[] = [];
    const q = query.trim();
    if (q) out.push({ key: "q", label: `q: ${q}` });
    if (difficultyFilter !== "all") out.push({ key: "diff", label: `diff: ${difficultyFilter}` });
    if (statusFilter !== "active") out.push({ key: "status", label: `status: ${statusFilter}` });
    if (dueFilter !== "all") out.push({ key: "due", label: `due: ${dueFilter}` });
    if (platformFilter !== "all") out.push({ key: "platform", label: `platform: ${platformFilter}` });
    if (topicFilter !== "all") out.push({ key: "topic", label: `topic: ${topicFilter}` });
    return out;
  }, [query, difficultyFilter, statusFilter, dueFilter, platformFilter, topicFilter]);

  async function createProblem(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const rawMin = initialMinutes.trim();
      const min = rawMin ? Number(rawMin) : 0;
      const timeSpentSec = Number.isFinite(min) && min > 0 ? Math.round(min * 60) : undefined;
      const reviewedAtISO = initialReviewedAt.trim() ? new Date(initialReviewedAt.trim()).toISOString() : undefined;

      const resp = await fetch("/api/problems", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url,
          title: title || undefined,
          platform: platform || undefined,
          difficulty: difficulty || undefined,
          topics: normalizeTopics(topics),
          ...(logInitial
            ? {
                initial_review: {
                  grade: initialGrade,
                  ...(timeSpentSec ? { time_spent_sec: timeSpentSec } : {}),
                  ...(reviewedAtISO ? { reviewed_at: reviewedAtISO } : {}),
                  source: "library_add",
                },
              }
            : {}),
        }),
      });
      if (!resp.ok) {
        const msg = (await resp.json().catch(() => null))?.error || "Failed to create problem";
        setError(String(msg));
        return;
      }
      setOpen(false);
      setURL("");
      setTitle("");
      setPlatform("");
      setDifficulty("");
      setTopics("");
      setLogInitial(false);
      setInitialGrade(3);
      setInitialMinutes("");
      setInitialReviewedAt("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(problemID: string, next: boolean) {
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/problems/${encodeURIComponent(problemID)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_active: next }),
      });
      if (!resp.ok) {
        setError("Failed to update problem");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  function openEdit(p: ProblemWithState) {
    setError(null);
    setEditID(p.id);
    setEditURL(p.url || "");
    setEditTitle(p.title || "");
    setEditPlatform(p.platform || "");
    setEditDifficulty(p.difficulty || "");
    setEditTopics((p.topics || []).join(", "));
    setEditOpen(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editID) return;
    setBusy(true);
    setError(null);
    try {
      const resp = await fetch(`/api/problems/${encodeURIComponent(editID)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: editTitle,
          platform: editPlatform,
          difficulty: editDifficulty,
          topics: normalizeTopics(editTopics),
        }),
      });
      if (!resp.ok) {
        const msg = (await resp.json().catch(() => null))?.error || "Failed to update problem";
        setError(String(msg));
        return;
      }
      setEditOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <div className="pf-kicker">Library</div>
          <CardTitle>Problems</CardTitle>
          <CardDescription>Your personal catalog with scheduling state.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={load}>
            Refresh
          </Button>
          <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit problem</DialogTitle>
                <DialogDescription>Updates canonical metadata for this problem.</DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={saveEdit}>
                <div className="space-y-2">
                  <Label>URL</Label>
                  <Input value={editURL} readOnly />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-title">Title</Label>
                    <Input id="edit-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-platform">Platform</Label>
                    <Input
                      id="edit-platform"
                      value={editPlatform}
                      onChange={(e) => setEditPlatform(e.target.value)}
                      placeholder="LeetCode"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-difficulty">Difficulty</Label>
                    <Input
                      id="edit-difficulty"
                      value={editDifficulty}
                      onChange={(e) => setEditDifficulty(e.target.value)}
                      placeholder="Easy/Medium/Hard"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-topics">Topics</Label>
                    <Input
                      id="edit-topics"
                      value={editTopics}
                      onChange={(e) => setEditTopics(e.target.value)}
                      placeholder="arrays, dp, graphs"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {busy ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>Add problem</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a problem</DialogTitle>
                <DialogDescription>Paste the URL, then add metadata if you want.</DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={createProblem}>
                <div className="space-y-2">
                  <Label htmlFor="url">URL</Label>
                  <Input id="url" value={url} onChange={(e) => setURL(e.target.value)} required />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="title">Title</Label>
                    <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="platform">Platform</Label>
                    <Input id="platform" value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="LeetCode" />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="difficulty">Difficulty</Label>
                    <Input id="difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} placeholder="Easy/Medium/Hard" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="topics">Topics</Label>
                    <Input id="topics" value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="arrays, dp, graphs" />
                  </div>
                </div>
                <div className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="pf-display text-base font-semibold">Log an initial attempt</div>
                      <div className="mt-1 text-xs text-[color:var(--muted)]">
                        Optional: backfill when you already solved it earlier.
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={logInitial}
                        onChange={(e) => {
                          setLogInitial(e.target.checked);
                          if (e.target.checked && !initialReviewedAt) setInitialReviewedAt(toDatetimeLocalValue(new Date()));
                        }}
                      />
                      Enable
                    </label>
                  </div>
                  {logInitial ? (
                    <div className="mt-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <GradeLegend />
                        <GradePicker value={initialGrade} onChange={setInitialGrade} />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Time spent (minutes)</Label>
                          <Input
                            inputMode="decimal"
                            value={initialMinutes}
                            onChange={(e) => setInitialMinutes(e.target.value)}
                            placeholder="e.g. 35"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Solved/reviewed at</Label>
                          <div className="flex items-center gap-2">
                            <Input
                              type="datetime-local"
                              value={initialReviewedAt}
                              onChange={(e) => setInitialReviewedAt(e.target.value)}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setInitialReviewedAt(toDatetimeLocalValue(new Date()))}
                              title="Set to now"
                            >
                              Now
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="secondary" type="button" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {busy ? "Saving..." : "Save"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 rounded-[24px] border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] p-4 shadow-[0_12px_28px_rgba(16,24,40,.05)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0 flex-1 sm:min-w-[260px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-medium text-[color:var(--muted)]">Search</div>
                <Button type="button" size="sm" variant="outline" onClick={() => setFiltersOpen((v) => !v)}>
                  {filtersOpen ? "Hide filters" : `Filters${activeFilters.length ? ` (${activeFilters.length})` : ""}`}
                </Button>
              </div>
              <Input
                id="q"
                className="mt-2 h-11 rounded-full"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, URL, platform, topic…"
              />
              <div className="mt-2 text-xs text-[color:var(--muted)]">
                Add a problem here to start tracking. Tracking items show up in <span className="font-medium text-[color:var(--foreground)]">Today</span> when due.
              </div>
              {!filtersOpen && activeFilters.length ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {activeFilters.map((f) => (
                    <Badge key={f.key} className="bg-[color:var(--pf-chip-bg)]">
                      {f.label}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {activeFilters.length ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setQuery("");
                    setDifficultyFilter("all");
                    setPlatformFilter("all");
                    setTopicFilter("all");
                    setStatusFilter("active");
                    setDueFilter("all");
                  }}
                >
                  Clear
                </Button>
              ) : null}
            </div>
          </div>

          {filtersOpen ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-full flex flex-wrap items-center gap-1 rounded-[18px] border border-[color:var(--line)] bg-[color:var(--pf-surface)] p-1 sm:w-auto">
                  {(["all", "easy", "medium", "hard", "unknown"] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDifficultyFilter(d)}
                      className={[
                        "px-3 py-2 text-xs font-semibold rounded-full transition",
                        difficultyFilter === d
                          ? "bg-[color:var(--pf-surface-strong)] shadow-[0_10px_22px_rgba(16,24,40,.06)]"
                          : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
                      ].join(" ")}
                      aria-label={`Diff: ${d}`}
                    >
                      {d === "all" ? "All" : d[0].toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>

                <div className="w-full flex flex-wrap items-center gap-1 rounded-[18px] border border-[color:var(--line)] bg-[color:var(--pf-surface)] p-1 sm:w-auto">
                  {([
                    { key: "active", label: "Tracking" },
                    { key: "archived", label: "Archived" },
                    { key: "all", label: "All" },
                  ] as const).map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setStatusFilter(t.key)}
                      className={[
                        "px-3 py-2 text-xs font-semibold rounded-full transition",
                        statusFilter === t.key
                          ? "bg-[color:var(--pf-surface-strong)] shadow-[0_10px_22px_rgba(16,24,40,.06)]"
                          : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
                      ].join(" ")}
                      aria-label={`Status ${t.label}`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="w-full flex flex-wrap items-center gap-1 rounded-[18px] border border-[color:var(--line)] bg-[color:var(--pf-surface)] p-1 sm:w-auto">
                  {([
                    { key: "all", label: "Any due" },
                    { key: "overdue", label: "Overdue" },
                    { key: "today", label: "Due today" },
                    { key: "soon", label: "Soon" },
                  ] as const).map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setDueFilter(t.key)}
                      className={[
                        "px-3 py-2 text-xs font-semibold rounded-full transition",
                        dueFilter === t.key
                          ? "bg-[color:var(--pf-surface-strong)] shadow-[0_10px_22px_rgba(16,24,40,.06)]"
                          : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
                      ].join(" ")}
                      aria-label={`Due filter ${t.label}`}
                      title={t.key === "soon" ? "Due in the next 3 days" : undefined}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:w-[360px]">
                <div className="space-y-2">
                  <div className="text-xs font-medium text-[color:var(--muted)]">Platform</div>
                  <select
                    className="h-11 w-full rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-input-bg)] px-4 text-sm shadow-[var(--pf-input-shadow)] outline-none transition focus:border-[rgba(15,118,110,.5)] focus:ring-4 focus:ring-[rgba(15,118,110,.14)]"
                    value={platformFilter}
                    onChange={(e) => setPlatformFilter(e.target.value)}
                  >
                    <option value="all">All</option>
                    {platforms.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-[color:var(--muted)]">Topic</div>
                  <select
                    className="h-11 w-full rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-input-bg)] px-4 text-sm shadow-[var(--pf-input-shadow)] outline-none transition focus:border-[rgba(15,118,110,.5)] focus:ring-4 focus:ring-[rgba(15,118,110,.14)]"
                    value={topicFilter}
                    onChange={(e) => setTopicFilter(e.target.value)}
                  >
                    <option value="all">All</option>
                    {topicsList.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-[color:var(--muted)]">
          <div>
            Showing <span className="font-medium text-[color:var(--foreground)]">{filtered.length}</span> of{" "}
            <span className="font-medium text-[color:var(--foreground)]">{items.length}</span>.
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-[rgba(180,35,24,.28)] bg-[rgba(180,35,24,.08)] px-4 py-3 text-sm">
            {error}
          </div>
        ) : null}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div
                key={idx}
                className="animate-pulse rounded-[20px] border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] p-4"
              >
                <div className="h-5 w-2/3 rounded bg-[rgba(16,24,40,.08)]" />
                <div className="mt-3 h-4 w-1/3 rounded bg-[rgba(16,24,40,.06)]" />
                <div className="mt-3 h-4 w-1/2 rounded bg-[rgba(16,24,40,.06)]" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-6 text-sm text-[color:var(--muted)]">
            No problems yet. Add one to start tracking.
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-6 text-sm text-[color:var(--muted)]">
            No matches. Try clearing filters.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="hidden md:block overflow-hidden rounded-[24px] border border-[color:var(--line)] bg-[color:var(--pf-surface)] shadow-[0_12px_28px_rgba(16,24,40,.06)]">
              <div className="flex items-center justify-between gap-4 border-b border-[color:var(--line)] bg-[color:var(--pf-surface-strong)] px-4 py-3 text-xs font-medium text-[color:var(--muted)]">
                <div>Problems</div>
                <div className="grid grid-cols-[140px_120px_200px] items-center gap-3 text-right">
                  <div className="text-left">Due</div>
                  <div className="text-left">Mastery</div>
                  <div>Actions</div>
                </div>
              </div>
              <div className="p-4">
                <div className="space-y-3">
                  {filtered.map((p) => {
                    const active = p.state?.is_active ?? true;
                    const diff = difficultyChip(p.difficulty || "");
                    const chip = dueChip(p.state?.due_at);
                    const d = p.state?.due_at ? daysFromNowISO(p.state.due_at) : 0;
                    const overdueDays = d < 0 ? Math.abs(d) : 0;
                    const mastery = masteryScore(p.state?.reps || 0, p.state?.ease || 2.5, overdueDays);
                    const masteryPct = Math.round(mastery);
                    return (
                      <div
                        key={p.id}
                        className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] p-4"
                      >
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_120px_200px] md:items-start">
                          <div className="min-w-0 md:pr-2">
                            <div className="pf-display text-sm font-semibold leading-tight">
                              <a
                                href={p.url}
                                target="_blank"
                                rel="noreferrer"
                                className="underline decoration-[rgba(15,118,110,.22)] underline-offset-4 hover:decoration-[rgba(15,118,110,.5)]"
                              >
                                <span className="block truncate">{p.title || p.url}</span>
                              </a>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[color:var(--muted)]">
                              {p.platform ? <span>{p.platform}</span> : null}
                              {diff ? <Badge className={diff.tone}>{diff.label}</Badge> : null}
                              <span>• reps {p.state?.reps ?? 0}</span>
                              {active ? (
                                <Badge
                                  className="border-[rgba(15,118,110,.28)] bg-[rgba(15,118,110,.08)]"
                                  title="Tracking enabled (shows up in Today and Contests)"
                                >
                                  Tracking
                                </Badge>
                              ) : (
                                <Badge className="border-[color:var(--line)] bg-[color:var(--pf-surface)]" title="Tracking disabled (archived)">
                                  Archived
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="flex items-start justify-start md:justify-end">
                            {chip ? (
                              <Badge className={chip.tone}>{chip.label}</Badge>
                            ) : (
                              <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">No due</Badge>
                            )}
                          </div>

                          <div className="flex items-start justify-start md:justify-end">
                            <div className="inline-flex items-center gap-2">
                              <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">{masteryPct}</Badge>
                              <div className="h-2 w-[84px] overflow-hidden rounded-full border border-[color:var(--line)] bg-[color:var(--pf-surface)]">
                                <div
                                  className="h-full bg-[rgba(45,212,191,.42)]"
                                  style={{ width: `${Math.max(4, Math.min(100, masteryPct))}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-start justify-start gap-2 md:justify-end">
                            <Button size="sm" variant="secondary" disabled={busy} onClick={() => openEdit(p)}>
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant={active ? "outline" : "primary"}
                              disabled={busy}
                              onClick={() => toggleActive(p.id, !active)}
                            >
                              {active ? "Archive" : "Activate"}
                            </Button>
                          </div>
                        </div>
                        {p.topics?.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {p.topics.slice(0, 6).map((t) => (
                              <Badge key={t} className="bg-[color:var(--pf-chip-bg)]">
                                {t}
                              </Badge>
                            ))}
                            {p.topics.length > 6 ? (
                              <Badge className="bg-[color:var(--pf-chip-bg)]">+{p.topics.length - 6}</Badge>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="space-y-3 md:hidden">
              {filtered.map((p) => {
                const active = p.state?.is_active ?? true;
                const diff = difficultyChip(p.difficulty || "");
                const chip = dueChip(p.state?.due_at);
                return (
                  <div
                    key={p.id}
                    className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--pf-surface)] p-4 shadow-[0_12px_28px_rgba(16,24,40,.06)]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="pf-display text-lg font-semibold leading-tight">
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-[rgba(15,118,110,.28)] underline-offset-4 hover:decoration-[rgba(15,118,110,.55)]"
                          >
                            {p.title || p.url}
                          </a>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[color:var(--muted)]">
                          {p.platform ? <span>{p.platform}</span> : null}
                          {diff ? <Badge className={diff.tone}>{diff.label}</Badge> : null}
                          {chip ? <Badge className={chip.tone}>{chip.label}</Badge> : null}
                          {active ? (
                            <Badge
                              className="border-[rgba(15,118,110,.28)] bg-[rgba(15,118,110,.08)]"
                              title="Tracking enabled (shows up in Today and Contests)"
                            >
                              Tracking
                            </Badge>
                          ) : (
                            <Badge className="border-[color:var(--line)] bg-[color:var(--pf-surface-weak)]" title="Tracking disabled (archived)">
                              Archived
                            </Badge>
                          )}
                        </div>
                        {p.topics?.length ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {p.topics.slice(0, 5).map((t) => (
                              <Badge key={t} className="bg-[color:var(--pf-chip-bg)]">
                                {t}
                              </Badge>
                            ))}
                            {p.topics.length > 5 ? (
                              <Badge className="bg-[color:var(--pf-chip-bg)]">+{p.topics.length - 5}</Badge>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => openEdit(p)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant={active ? "outline" : "primary"}
                          disabled={busy}
                          onClick={() => toggleActive(p.id, !active)}
                        >
                          {active ? "Archive" : "Activate"}
                        </Button>
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
  );
}

"use client";

import * as React from "react";
import { GripVertical } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { List, ListWithItems, ProblemWithState } from "@/lib/types";
import { difficultyChip } from "@/lib/presentation";

function toneForSource(sourceType: string) {
  if (sourceType === "template") return "border-[rgba(161,98,7,.28)] bg-[rgba(161,98,7,.08)]";
  return "border-[rgba(15,118,110,.28)] bg-[rgba(15,118,110,.08)]";
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

export default function ListsPage() {
  const [lists, setLists] = React.useState<List[]>([]);
  const [selectedID, setSelectedID] = React.useState<string>("");
  const [selected, setSelected] = React.useState<ListWithItems | null>(null);
  const [library, setLibrary] = React.useState<ProblemWithState[]>([]);
  const [q, setQ] = React.useState("");
  const [view, setView] = React.useState<"lists" | "topics">("lists");
  const [selectedTopic, setSelectedTopic] = React.useState<string>("");

  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [draggingID, setDraggingID] = React.useState<string | null>(null);
  const [draftIDs, setDraftIDs] = React.useState<string[]>([]);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [createDesc, setCreateDesc] = React.useState("");

  const [addOpen, setAddOpen] = React.useState(false);
  const [addQuery, setAddQuery] = React.useState("");

  async function loadLists() {
    setError(null);
    const resp = await fetch("/api/lists", { cache: "no-store" });
    if (!resp.ok) {
      setError("Failed to load lists");
      return;
    }
    const data = (await resp.json().catch(() => null)) as unknown;
    setLists(Array.isArray(data) ? (data as List[]) : []);
  }

  async function loadLibrary() {
    const resp = await fetch("/api/problems", { cache: "no-store" });
    if (!resp.ok) {
      setLibrary([]);
      return;
    }
    const data = (await resp.json().catch(() => null)) as unknown;
    setLibrary(Array.isArray(data) ? (data as ProblemWithState[]) : []);
  }

  async function loadSelected(id: string) {
    setError(null);
    setNotice(null);
    if (!id) {
      setSelected(null);
      return null;
    }
    const resp = await fetch(`/api/lists/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!resp.ok) {
      setSelected(null);
      setError("Failed to load list details");
      return null;
    }
    const data = (await resp.json().catch(() => null)) as unknown;
    const out = data && typeof data === "object" ? (data as ListWithItems) : null;
    setSelected(out);
    return out;
  }

  React.useEffect(() => {
    void loadLists();
    void loadLibrary();
  }, []);

  React.useEffect(() => {
    void loadSelected(selectedID);
  }, [selectedID]);

  React.useEffect(() => {
    // Keep a local order for drag-drop without fighting server refreshes.
    if (view !== "lists") return;
    if (!selected) {
      setDraftIDs([]);
      return;
    }
    setDraftIDs(selected.items.map((x) => x.problem.id));
    setDraggingID(null);
  }, [selected?.id, selected?.items?.length, view]);

  async function createList() {
    const name = createName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const resp = await fetch("/api/lists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description: createDesc.trim() }),
      });
      if (!resp.ok) {
        setError("Failed to create list");
        return;
      }
      setCreateName("");
      setCreateDesc("");
      setCreateOpen(false);
      await loadLists();
    } finally {
      setBusy(false);
    }
  }

  async function importTemplate(templateKey: "blind75" | "neetcode150") {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const resp = await fetch("/api/lists/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ template_key: templateKey, version: "v1" }),
      });
      if (!resp.ok) {
        setError("Failed to import template list");
        return;
      }
      const data = (await resp.json().catch(() => null)) as unknown;
      const list = data && typeof data === "object" ? (data as ListWithItems) : null;
      await loadLists();
      if (list?.id) setSelectedID(list.id);
    } finally {
      setBusy(false);
    }
  }

  async function addProblemToList(problemID: string) {
    if (!selectedID) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const resp = await fetch(`/api/lists/${encodeURIComponent(selectedID)}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ problem_id: problemID }),
      });
      if (!resp.ok) {
        const msg = (await resp.json().catch(() => null))?.error || "Failed to add problem to list";
        // Some network failures can still commit on the backend. Verify by reloading.
        const latest = await loadSelected(selectedID);
        const exists = latest?.items?.some((x) => x.problem.id === problemID) ?? false;
        if (exists) {
          setNotice("Problem added, but the request response failed. The list is updated.");
        } else {
          setError(String(msg));
        }
        return;
      }
      setAddQuery("");
      setAddOpen(false);
      await loadSelected(selectedID);
      setNotice("Added to list.");
    } finally {
      setBusy(false);
    }
  }

  async function reorder(problemIDs: string[]) {
    if (!selectedID) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const resp = await fetch(`/api/lists/${encodeURIComponent(selectedID)}/items/reorder`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ problem_ids: problemIDs }),
      });
      if (!resp.ok) {
        const msg = (await resp.json().catch(() => null))?.error || "Failed to reorder items";
        setError(String(msg));
        await loadSelected(selectedID);
        return;
      }
      await loadSelected(selectedID);
      setNotice("Order saved.");
    } finally {
      setBusy(false);
    }
  }

  const filteredLists = lists.filter((l) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return (l.name || "").toLowerCase().includes(needle) || (l.description || "").toLowerCase().includes(needle);
  });

  const topics = React.useMemo(() => {
    const map = new Map<string, { topic: string; count: number; overdue: number }>();
    for (const p of library) {
      if ((p.state?.is_active ?? true) !== true) continue;
      const dueAt = p.state?.due_at || "";
      const isOverdue = dueAt ? daysFromNowISO(dueAt) < 0 : false;
      for (const t of p.topics || []) {
        const key = (t || "").trim().toLowerCase();
        if (!key) continue;
        const cur = map.get(key) || { topic: key, count: 0, overdue: 0 };
        cur.count += 1;
        if (isOverdue) cur.overdue += 1;
        map.set(key, cur);
      }
    }
    const out = Array.from(map.values()).sort((a, b) => {
      if (b.overdue !== a.overdue) return b.overdue - a.overdue;
      if (b.count !== a.count) return b.count - a.count;
      return a.topic.localeCompare(b.topic);
    });
    const needle = q.trim().toLowerCase();
    return needle ? out.filter((x) => x.topic.includes(needle)) : out;
  }, [library, q]);

  const topicProblems = React.useMemo(() => {
    const needle = selectedTopic.trim().toLowerCase();
    if (!needle) return [];
    const now = Date.now();
    return library
      .filter((p) => (p.state?.is_active ?? true) === true)
      .filter((p) => (p.topics || []).some((t) => (t || "").trim().toLowerCase() === needle))
      .map((p) => {
        const dueAt = p.state?.due_at || "";
        const od = dueAt ? Math.max(0, Math.floor((now - new Date(dueAt).getTime()) / (1000 * 60 * 60 * 24))) : 0;
        const mastery = masteryScore(p.state?.reps || 0, p.state?.ease || 2.5, od);
        return { p, mastery };
      })
      .sort((a, b) => {
        const ad = new Date(a.p.state?.due_at || 0).getTime();
        const bd = new Date(b.p.state?.due_at || 0).getTime();
        if (ad !== bd) return ad - bd;
        return b.mastery - a.mastery;
      });
  }, [library, selectedTopic]);

  const libraryFiltered = library
    .filter((p) => (p.state?.is_active ?? true) === true)
    .filter((p) => {
      const needle = addQuery.trim().toLowerCase();
      if (!needle) return true;
      return (
        (p.title || "").toLowerCase().includes(needle) ||
        (p.url || "").toLowerCase().includes(needle) ||
        (p.platform || "").toLowerCase().includes(needle)
      );
    })
    .slice(0, 30);

  function moveID(ids: string[], id: string, toIndex: number) {
    const fromIndex = ids.indexOf(id);
    if (fromIndex < 0) return ids;
    const next = [...ids];
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, id);
    return next;
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <Card className="h-fit lg:sticky lg:top-6 self-start">
        <CardHeader>
          <div>
            <div className="pf-kicker">Lists</div>
            <CardTitle>Collections</CardTitle>
            <CardDescription>Inspired by Grind75: browse by list or by topic.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-2xl border border-[rgba(180,35,24,.28)] bg-[rgba(180,35,24,.08)] px-4 py-3 text-sm">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="rounded-2xl border border-[rgba(45,212,191,.24)] bg-[rgba(45,212,191,.10)] px-4 py-3 text-sm">
              {notice}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button variant="primary" disabled={busy}>
                  New list
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create a list</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <Input placeholder="List name" value={createName} onChange={(e) => setCreateName(e.target.value)} />
                  <Input
                    placeholder="Description (optional)"
                    value={createDesc}
                    onChange={(e) => setCreateDesc(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setCreateOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={createList} disabled={busy || !createName.trim()}>
                      Create
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="outline" onClick={() => importTemplate("blind75")} disabled={busy}>
              Import Blind 75
            </Button>
            <Button variant="outline" onClick={() => importTemplate("neetcode150")} disabled={busy}>
              Import NeetCode 150
            </Button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={view === "lists" ? "primary" : "outline"}
              onClick={() => setView("lists")}
            >
              Lists
            </Button>
            <Button
              type="button"
              size="sm"
              variant={view === "topics" ? "primary" : "outline"}
              onClick={() => {
                setView("topics");
                if (!selectedTopic && topics[0]) setSelectedTopic(topics[0].topic);
              }}
            >
              Topics
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={loadLibrary} disabled={busy} title="Refresh library topics">
              Sync
            </Button>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Input
              className="rounded-full"
              placeholder={view === "topics" ? "Search topics" : "Search lists"}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button variant="secondary" onClick={loadLists} disabled={busy}>
              Refresh
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            {view === "lists" ? (
              filteredLists.length === 0 ? (
              <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-6 text-sm text-[color:var(--muted)]">
                No lists yet. Create one or import a template.
              </div>
            ) : (
              filteredLists.map((l) => {
                const active = selectedID === l.id;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setSelectedID(l.id)}
                    className={[
                      "w-full text-left rounded-[20px] border px-4 py-3 transition",
                      active
                        ? "border-[rgba(15,118,110,.45)] bg-[rgba(15,118,110,.08)] shadow-[0_10px_22px_rgba(16,24,40,.08)]"
                        : "border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] hover:border-[rgba(15,118,110,.35)] hover:bg-[color:var(--pf-surface)]",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="pf-display text-base font-semibold leading-tight truncate">{l.name}</div>
                        {l.description ? (
                          <div className="mt-1 text-xs text-[color:var(--muted)] truncate">{l.description}</div>
                        ) : null}
                      </div>
                      <Badge className={toneForSource(l.source_type)}>{l.source_type}</Badge>
                    </div>
                  </button>
                );
              })
            )
            ) : topics.length === 0 ? (
              <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-6 text-sm text-[color:var(--muted)]">
                No topics yet. Add topics to problems in Library.
              </div>
            ) : (
              topics.map((t) => {
                const active = selectedTopic === t.topic;
                return (
                  <button
                    key={t.topic}
                    type="button"
                    onClick={() => setSelectedTopic(t.topic)}
                    className={[
                      "w-full text-left rounded-[20px] border px-4 py-3 transition",
                      active
                        ? "border-[rgba(45,212,191,.45)] bg-[rgba(45,212,191,.10)] shadow-[0_10px_22px_rgba(16,24,40,.08)]"
                        : "border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] hover:border-[rgba(45,212,191,.35)] hover:bg-[color:var(--pf-surface)]",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="pf-display text-base font-semibold leading-tight capitalize truncate">{t.topic}</div>
                        <div className="mt-1 text-xs text-[color:var(--muted)]">
                          {t.count} problems{t.overdue ? ` • ${t.overdue} overdue` : ""}
                        </div>
                      </div>
                      <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">{t.count}</Badge>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="min-h-[420px]">
        <CardHeader>
          <div>
            <div className="pf-kicker">Details</div>
            <CardTitle>
              {view === "topics" ? (selectedTopic ? `Topic: ${selectedTopic}` : "Select a topic") : selected?.name || "Select a list"}
            </CardTitle>
            <CardDescription>
              {view === "topics"
                ? "See everything under one topic with scheduling stats."
                : selected
                  ? `${selected.items?.length || 0} items`
                  : "Pick a list to view and reorder problems."}
            </CardDescription>
          </div>
          {selected ? (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" disabled={busy}>
                  Add problem
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add from Library</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <Input
                    placeholder="Search title / URL / platform"
                    value={addQuery}
                    onChange={(e) => setAddQuery(e.target.value)}
                  />
                  <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
                    {libraryFiltered.length === 0 ? (
                      <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-6 text-sm text-[color:var(--muted)]">
                        No matching problems.
                      </div>
                    ) : (
                      libraryFiltered.map((p) => {
                        const diff = difficultyChip(p.difficulty || "");
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => addProblemToList(p.id)}
                            className="w-full rounded-[18px] border border-[color:var(--line)] bg-[color:var(--pf-surface)] px-4 py-3 text-left hover:border-[rgba(15,118,110,.35)] hover:bg-[color:var(--pf-surface-hover)]"
                          >
                            <div className="pf-display text-sm font-semibold leading-tight">{p.title || p.url}</div>
                            <div className="mt-1 text-xs text-[color:var(--muted)]">
                              {p.platform ? <span>{p.platform}</span> : null}
                              {diff ? (
                                <span className="ml-2 inline-flex">
                                  <Badge className={diff.tone}>{diff.label}</Badge>
                                </span>
                              ) : null}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}
        </CardHeader>
        <CardContent>
          <div>
            {view === "topics" ? (
              selectedTopic ? (
                topicProblems.length === 0 ? (
                  <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-8 text-sm text-[color:var(--muted)]">
                    No problems in this topic.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {topicProblems.map(({ p, mastery }) => {
                      const chip = dueChip(p.state?.due_at);
                      const diff = difficultyChip(p.difficulty || "");
                      return (
                        <div
                          key={p.id}
                          className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--pf-surface)] px-4 py-3 shadow-[0_10px_22px_rgba(16,24,40,.05)]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-[240px]">
                              <div className="pf-display text-sm font-semibold leading-tight">
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
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-8 text-sm text-[color:var(--muted)]">
                  Select a topic on the left.
                </div>
              )
            ) : !selected ? (
              <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-8 text-sm text-[color:var(--muted)]">
                Select or import a list to see items here.
              </div>
            ) : selected.items.length === 0 ? (
              <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-8 text-sm text-[color:var(--muted)]">
                Empty list. Add problems from Library.
              </div>
            ) : (
              <div className="space-y-2">
                {(draftIDs.length ? draftIDs : selected.items.map((x) => x.problem.id)).map((pid, idx) => {
                  const it = selected.items.find((x) => x.problem.id === pid);
                  if (!it) return null;
                  return (
                    <div
                      key={it.problem.id}
                      draggable={!busy}
                      onDragStart={(e) => {
                        setDraggingID(it.problem.id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", it.problem.id);
                      }}
                      onDragEnd={() => setDraggingID(null)}
                      onDragOver={(e) => {
                        if (busy) return;
                        e.preventDefault();
                        if (!draggingID || draggingID === it.problem.id) return;
                        setDraftIDs((prev) => moveID(prev.length ? prev : selected.items.map((x) => x.problem.id), draggingID, idx));
                      }}
                      onDrop={(e) => {
                        if (busy) return;
                        e.preventDefault();
                        const ids = draftIDs.length ? draftIDs : selected.items.map((x) => x.problem.id);
                        setDraggingID(null);
                        void reorder(ids);
                      }}
                      className={[
                        "flex flex-wrap items-center justify-between gap-3 rounded-[20px] border px-4 py-3 shadow-[0_10px_22px_rgba(16,24,40,.05)] transition",
                        "border-[color:var(--line)] bg-[color:var(--pf-surface)] hover:bg-[color:var(--pf-surface-hover)]",
                        draggingID === it.problem.id ? "opacity-80 ring-4 ring-[rgba(45,212,191,.14)]" : "",
                      ].join(" ")}
                    >
                      <div className="min-w-[240px]">
                        <div className="pf-display text-sm font-semibold leading-tight">
                          <span
                            className="mr-2 inline-flex items-center align-middle text-[color:var(--muted)]"
                            title="Drag to reorder"
                          >
                            <GripVertical className="h-4 w-4" />
                          </span>
                          <a
                            href={it.problem.url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-[rgba(15,118,110,.28)] underline-offset-4 hover:decoration-[rgba(15,118,110,.55)]"
                          >
                            {it.problem.title || it.problem.url}
                          </a>
                        </div>
                        <div className="mt-1 text-xs text-[color:var(--muted)]">
                          {it.problem.platform ? <span>{it.problem.platform}</span> : null}
                          {it.problem.difficulty ? <span> • {it.problem.difficulty}</span> : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Mobile fallback controls (drag is poor on touch). */}
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy || idx === 0}
                          onClick={() => {
                            const ids = selected.items.map((x) => x.problem.id);
                            const next = [...ids];
                            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                            setDraftIDs(next);
                            void reorder(next);
                          }}
                        >
                          Up
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy || idx === selected.items.length - 1}
                          onClick={() => {
                            const ids = selected.items.map((x) => x.problem.id);
                            const next = [...ids];
                            [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                            setDraftIDs(next);
                            void reorder(next);
                          }}
                        >
                          Down
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

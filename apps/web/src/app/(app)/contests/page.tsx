"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ContestWithItems } from "@/lib/types";
import { GradeLegend, GradePicker } from "@/components/grade-picker";
import { difficultyChip } from "@/lib/presentation";

type Strategy = "balanced" | "weakness" | "due-heavy";

function fmtMMSS(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function ContestsPage() {
  const router = useRouter();
  const [durationMinutes, setDurationMinutes] = React.useState("60");
  const [strategy, setStrategy] = React.useState<Strategy>("balanced");
  const [easy, setEasy] = React.useState("2");
  const [medium, setMedium] = React.useState("2");
  const [hard, setHard] = React.useState("1");

  const [contest, setContest] = React.useState<ContestWithItems | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const [startedAt, setStartedAt] = React.useState<number | null>(null);
  const [nowTick, setNowTick] = React.useState(0);

  const [gradeByID, setGradeByID] = React.useState<Record<string, number>>({});
  const [minutesByID, setMinutesByID] = React.useState<Record<string, string>>({});
  const [solvedByID, setSolvedByID] = React.useState<Record<string, boolean>>({});
  const [busyID, setBusyID] = React.useState<string>("");

  function isRecorded(it: ContestWithItems["items"][number]) {
    return Boolean(it.result && (it.result.grade != null || it.result.recorded_at != null));
  }

  React.useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNowTick(Date.now()), 750);
    return () => clearInterval(t);
  }, [startedAt]);

  React.useEffect(() => {
    // Seed defaults per contest item without clobbering user edits.
    if (!contest) return;
    setGradeByID((prev) => {
      const next = { ...prev };
      for (const it of contest.items) {
        if (typeof next[it.problem.id] !== "number") next[it.problem.id] = 3;
      }
      return next;
    });
    setSolvedByID((prev) => {
      const next = { ...prev };
      for (const it of contest.items) {
        if (typeof next[it.problem.id] !== "boolean") next[it.problem.id] = true;
        if (it.result?.solved_flag != null) next[it.problem.id] = Boolean(it.result.solved_flag);
      }
      return next;
    });
    setMinutesByID((prev) => {
      const next = { ...prev };
      for (const it of contest.items) {
        if (it.result?.time_spent_sec != null) next[it.problem.id] = String(Math.round(Number(it.result.time_spent_sec) / 60));
      }
      return next;
    });
  }, [contest?.id]);

  async function generate() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const dm = Math.max(10, Number(durationMinutes) || 60);
      const mix = {
        easy: Math.max(0, Number(easy) || 0),
        medium: Math.max(0, Number(medium) || 0),
        hard: Math.max(0, Number(hard) || 0),
      };
      const resp = await fetch("/api/contests/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ duration_minutes: dm, strategy, difficulty_mix: mix }),
      });
      if (!resp.ok) {
        const msg = (await resp.text().catch(() => "")) || "";
        setError(msg.includes("no eligible") ? "No eligible problems found. Add problems first." : "Failed to generate contest");
        return;
      }
      const data = (await resp.json().catch(() => null)) as unknown;
      const c = data && typeof data === "object" ? (data as ContestWithItems) : null;
      setContest(c);
      setGradeByID({});
      setMinutesByID({});
      setSolvedByID({});
      setStartedAt(null);
      setNotice("Contest generated. Start when ready.");
    } finally {
      setBusy(false);
    }
  }

  async function startContest() {
    if (!contest) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const resp = await fetch(`/api/contests/${encodeURIComponent(contest.id)}/start`, { method: "POST" });
      if (!resp.ok) {
        setError("Failed to start contest");
        return;
      }
      const started = (await resp.json().catch(() => null)) as any;
      const ts = started?.started_at ? Date.parse(started.started_at) : Date.now();
      setStartedAt(Number.isFinite(ts) ? ts : Date.now());
      setNotice("Timer started.");
    } finally {
      setBusy(false);
    }
  }

  async function finishContest() {
    if (!contest) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const unrecorded = contest.items.filter((it) => !isRecorded(it)).length;
      if (unrecorded > 0) {
        const ok = window.confirm(`You still have ${unrecorded} unrecorded problems. Finish anyway?`);
        if (!ok) return;
      }

      const resp = await fetch(`/api/contests/${encodeURIComponent(contest.id)}/complete`, { method: "POST" });
      if (!resp.ok) {
        setError("Failed to finish contest");
        return;
      }

      const latest = await fetch(`/api/contests/${encodeURIComponent(contest.id)}`, { cache: "no-store" });
      const data = latest.ok ? ((await latest.json().catch(() => null)) as unknown) : null;
      const c = data && typeof data === "object" ? (data as ContestWithItems) : null;
      if (c) setContest(c);
      setNotice("Contest finished. Recorded results are already applied to your schedule.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmOne(problemID: string) {
    if (!contest) return;
    setBusyID(problemID);
    setError(null);
    setNotice(null);
    try {
      const grade = gradeByID[problemID];
      if (typeof grade !== "number" || grade < 0 || grade > 4) {
        setError("Pick a grade (0-4) first.");
        return;
      }
      const rawMin = (minutesByID[problemID] || "").trim();
      const min = rawMin ? Number(rawMin) : 0;
      const timeSpentSec = Number.isFinite(min) && min > 0 ? Math.round(min * 60) : undefined;
      const solved = solvedByID[problemID];

      const resp = await fetch(`/api/contests/${encodeURIComponent(contest.id)}/results`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          results: [
            {
              problem_id: problemID,
              grade,
              solved_flag: typeof solved === "boolean" ? solved : true,
              ...(timeSpentSec ? { time_spent_sec: timeSpentSec } : {}),
            },
          ],
        }),
      });
      if (!resp.ok) {
        setError("Failed to confirm this result");
        return;
      }
      const updated = (await resp.json().catch(() => null)) as unknown;
      const c = updated && typeof updated === "object" ? (updated as ContestWithItems) : null;
      if (c) setContest(c);
      setNotice("Recorded. Schedule updated.");
    } finally {
      setBusyID("");
    }
  }

  const elapsed = startedAt ? Date.now() - startedAt : 0;
  const recordedCount = contest ? contest.items.filter((it) => isRecorded(it)).length : 0;
  const finished = Boolean(contest?.completed_at);

  const summary = React.useMemo(() => {
    if (!contest) return null;
    const recorded = contest.items.filter((it) => isRecorded(it));
    const grades = recorded.map((it) => Number(it.result?.grade)).filter((x) => Number.isFinite(x));
    const timeSec = recorded
      .map((it) => Number(it.result?.time_spent_sec))
      .filter((x) => Number.isFinite(x) && x > 0)
      .reduce((a, b) => a + b, 0);
    const solved = recorded.filter((it) => it.result?.solved_flag === true).length;
    const avgGrade = grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : 0;
    const totalMin = Math.round(timeSec / 60);
    return {
      recorded: recorded.length,
      total: contest.items.length,
      solved,
      avgGrade,
      totalMin,
    };
  }, [contest?.id, contest?.items]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <div>
            <div className="pf-kicker">Contests</div>
            <CardTitle>Timed sessions</CardTitle>
            <CardDescription>Generate a focused set, practice externally, then log results.</CardDescription>
          </div>
          <Button variant="outline" onClick={generate} disabled={busy}>
            Generate
          </Button>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-2xl border border-[rgba(180,35,24,.28)] bg-[rgba(180,35,24,.08)] px-4 py-3 text-sm">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="rounded-2xl border border-[rgba(15,118,110,.28)] bg-[rgba(15,118,110,.08)] px-4 py-3 text-sm">
              {notice}
            </div>
          ) : null}

          <div className="mt-2 grid gap-3 md:grid-cols-2">
            <div className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] p-4">
              <div className="text-xs text-[color:var(--muted)]">Duration (minutes)</div>
              <Input
                className="mt-2 rounded-full"
                inputMode="numeric"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              />
            </div>
            <div className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] p-4">
              <div className="text-xs text-[color:var(--muted)]">Strategy</div>
              <select
                className="mt-2 h-10 w-full rounded-full border border-[color:var(--line)] bg-[color:var(--pf-input-bg)] px-4 text-sm outline-none focus:ring-4 focus:ring-[rgba(15,118,110,.2)]"
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as Strategy)}
              >
                <option value="balanced">Balanced</option>
                <option value="weakness">Weakness-focused</option>
                <option value="due-heavy">Due-heavy</option>
              </select>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] p-4">
              <div className="text-xs text-[color:var(--muted)]">Easy</div>
              <Input className="mt-2 rounded-full" inputMode="numeric" value={easy} onChange={(e) => setEasy(e.target.value)} />
            </div>
            <div className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] p-4">
              <div className="text-xs text-[color:var(--muted)]">Medium</div>
              <Input
                className="mt-2 rounded-full"
                inputMode="numeric"
                value={medium}
                onChange={(e) => setMedium(e.target.value)}
              />
            </div>
            <div className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] p-4">
              <div className="text-xs text-[color:var(--muted)]">Hard</div>
              <Input className="mt-2 rounded-full" inputMode="numeric" value={hard} onChange={(e) => setHard(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <div className="pf-kicker">Session</div>
            <CardTitle>{contest ? "Your contest" : "No contest yet"}</CardTitle>
            <CardDescription>
              {contest ? (
                <span>
                  {contest.items.length} problems • {contest.duration_minutes} minutes
                </span>
              ) : (
                "Generate a contest to get a curated set."
              )}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">
              Timer: {startedAt ? fmtMMSS(elapsed) : "00:00"}
            </Badge>
            {contest ? (
              <Badge className="border-[rgba(15,118,110,.22)] bg-[rgba(15,118,110,.08)]">
                Recorded {recordedCount}/{contest.items.length}
              </Badge>
            ) : null}
            <Button variant="outline" onClick={startContest} disabled={busy || !contest || Boolean(startedAt) || finished}>
              Start
            </Button>
            <Button onClick={finishContest} disabled={busy || !contest}>
              Finish contest
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {finished && summary ? (
            <div className="mb-3 rounded-[20px] border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-[240px]">
                  <div className="pf-display text-base font-semibold leading-tight">Contest summary</div>
                  <div className="mt-1 text-xs text-[color:var(--muted)]">
                    Recording each problem updates scheduling immediately.
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => router.push("/today")}>
                    Go to Today
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setContest(null);
                      setNotice(null);
                      setError(null);
                      setStartedAt(null);
                    }}
                  >
                    New contest
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">
                  Recorded {summary.recorded}/{summary.total}
                </Badge>
                <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">Solved {summary.solved}</Badge>
                <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">
                  Avg grade {summary.avgGrade ? summary.avgGrade.toFixed(1) : "—"}
                </Badge>
                <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">
                  Time {summary.totalMin ? `${summary.totalMin}m` : "—"}
                </Badge>
              </div>
            </div>
          ) : null}
          <div className="mb-3">
            <GradeLegend />
          </div>
          {!contest ? (
            <div className="rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-4 py-8 text-sm text-[color:var(--muted)]">
              Generate a contest to see problems here.
            </div>
          ) : (
            <div className="space-y-2">
              {contest.items.map((it, idx) => {
                const g = gradeByID[it.problem.id];
                const recorded = isRecorded(it);
                const diff = difficultyChip(it.problem.difficulty || "");
                return (
                  <div
                    key={it.problem.id}
                    className="rounded-[20px] border border-[color:var(--line)] bg-[color:var(--pf-surface)] p-4 shadow-[0_12px_28px_rgba(16,24,40,.06)]"
                  >
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="pf-display text-base font-semibold leading-tight">
                          <span className="mr-2 text-[color:var(--muted)]">#{idx + 1}</span>
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
                          {diff ? (
                            <span className="ml-2 inline-flex">
                              <Badge className={diff.tone}>{diff.label}</Badge>
                            </span>
                          ) : null}
                          {it.target_minutes ? <span> • target {it.target_minutes}m</span> : null}
                          {recorded ? <span> • recorded</span> : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Input
                          className="h-9 w-[78px] sm:w-[92px] rounded-full"
                          inputMode="decimal"
                          placeholder="min"
                          value={minutesByID[it.problem.id] || ""}
                          onChange={(e) =>
                            setMinutesByID((m) => ({
                              ...m,
                              [it.problem.id]: e.target.value,
                            }))
                          }
                          title="Optional time spent (minutes)"
                        />
                        <label
                          className="flex items-center gap-2 rounded-full border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] px-2 py-2 sm:px-3 text-[11px] sm:text-xs text-[color:var(--muted)]"
                          title="Checked means you solved without reading the solution. Uncheck if you couldn't solve."
                        >
                          <input
                            type="checkbox"
                            checked={solvedByID[it.problem.id] ?? true}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setSolvedByID((m) => ({
                                ...m,
                                [it.problem.id]: checked,
                              }));
                              if (!checked) {
                                setGradeByID((m) => ({
                                  ...m,
                                  [it.problem.id]: Math.min(m[it.problem.id] ?? 3, 1),
                                }));
                              }
                            }}
                            disabled={busy || recorded}
                          />
                          Solved
                        </label>
                        <GradePicker
                          value={g ?? 3}
                          onChange={(x) => {
                            const solved = solvedByID[it.problem.id] ?? true;
                            const next = solved ? x : Math.min(x, 1);
                            setGradeByID((m) => ({ ...m, [it.problem.id]: next }));
                          }}
                          disabled={busy || recorded}
                        />
                        {recorded ? (
                          <Badge className="border-[rgba(45,212,191,.28)] bg-[rgba(45,212,191,.12)]">Recorded</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={busy || busyID === it.problem.id}
                            onClick={() => confirmOne(it.problem.id)}
                            title="Confirm this problem's result (updates schedule)"
                          >
                            {busyID === it.problem.id ? "Saving..." : "Confirm"}
                          </Button>
                        )}
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
  );
}

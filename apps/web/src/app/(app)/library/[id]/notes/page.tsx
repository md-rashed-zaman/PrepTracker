"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProblemNotesGetResponse, ProblemNotesPutResponse, ProblemWithState } from "@/lib/types";
import { NotesEditor, type NotesDoc } from "@/components/notes/notes-editor";

function fmtTime(ts?: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function emptyDoc() {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export default function ProblemNotesPage(props: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [problemID, setProblemID] = React.useState<string>("");

  const [problem, setProblem] = React.useState<ProblemWithState | null>(null);
  const [initialJSON, setInitialJSON] = React.useState<any>(null);
  const [updatedAt, setUpdatedAt] = React.useState<string | null>(null);

  const [busy, setBusy] = React.useState(false);
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);

  const lastDocRef = React.useRef<NotesDoc | null>(null);
  const timerRef = React.useRef<any>(null);
  const skipFirstChangeRef = React.useRef(true);

  React.useEffect(() => {
    void (async () => {
      const { id } = await props.params;
      setProblemID(id);
    })();
  }, [props.params]);

  React.useEffect(() => {
    if (!problemID) return;
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        // Load problem metadata (title/url/platform) from the user's library.
        const lib = await fetch("/api/problems", { cache: "no-store" });
        if (lib.ok) {
          const arr = (await lib.json().catch(() => null)) as unknown;
          if (Array.isArray(arr)) {
            const p = (arr as ProblemWithState[]).find((x) => x.id === problemID) || null;
            setProblem(p);
          }
        }

        const resp = await fetch(`/api/problems/${encodeURIComponent(problemID)}/notes`, { cache: "no-store" });
        if (!resp.ok) {
          setError("Failed to load notes");
          setInitialJSON(emptyDoc());
          setUpdatedAt(null);
          return;
        }
        const data = (await resp.json().catch(() => null)) as ProblemNotesGetResponse | null;
        const json = data?.content_json && typeof data.content_json === "object" ? data.content_json : emptyDoc();
        setInitialJSON(json);
        setUpdatedAt(data?.updated_at || null);
        setSaveState(data?.exists ? "saved" : "idle");
        skipFirstChangeRef.current = true;
      } finally {
        setBusy(false);
      }
    })();
  }, [problemID]);

  async function saveNow(doc: NotesDoc) {
    if (!problemID) return;
    setSaveState("saving");
    setError(null);
    try {
      const resp = await fetch(`/api/problems/${encodeURIComponent(problemID)}/notes`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content_md: doc.markdown,
          content_json: doc.json,
        }),
      });
      if (!resp.ok) {
        const msg = (await resp.json().catch(() => null))?.error || "Failed to save notes";
        setSaveState("error");
        setError(String(msg));
        return;
      }
      const data = (await resp.json().catch(() => null)) as ProblemNotesPutResponse | null;
      setUpdatedAt(data?.updated_at || null);
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      setError(String(e));
    }
  }

  function scheduleSave(doc: NotesDoc) {
    lastDocRef.current = doc;
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const d = lastDocRef.current;
      if (d) void saveNow(d);
    }, 900);
  }

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const title = problem?.title || problem?.url || "Notes";

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex-wrap items-start gap-3">
          <div className="min-w-0">
            <div className="pf-kicker">Library</div>
            <CardTitle className="truncate">Notes</CardTitle>
            <CardDescription className="truncate">
              {problem?.url ? (
                <a
                  href={problem.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-[rgba(45,212,191,.22)] underline-offset-4 hover:decoration-[rgba(45,212,191,.55)]"
                >
                  {title}
                </a>
              ) : (
                <span className="text-[color:var(--muted)]">Problem: {problemID}</span>
              )}
            </CardDescription>
          </div>
          <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
            <div className="flex items-center gap-2">
              {saveState === "saving" ? (
                <Badge className="border-[rgba(251,191,36,.28)] bg-[rgba(251,191,36,.10)]">Saving…</Badge>
              ) : saveState === "saved" ? (
                <Badge className="border-[rgba(45,212,191,.28)] bg-[rgba(45,212,191,.10)]">
                  Saved{updatedAt ? ` · ${fmtTime(updatedAt)}` : ""}
                </Badge>
              ) : saveState === "error" ? (
                <Badge className="border-[rgba(251,113,133,.28)] bg-[rgba(251,113,133,.10)]">Save failed</Badge>
              ) : (
                <Badge className="border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]">Draft</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => router.back()} disabled={busy}>
                Back
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const d = lastDocRef.current;
                  if (d) void saveNow(d);
                }}
                disabled={busy || saveState === "saving"}
                title="Save now"
              >
                Save
              </Button>
              <Button asChild variant="secondary">
                <Link href="/library">Library</Link>
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {error ? (
        <div className="rounded-2xl border border-[rgba(251,113,133,.28)] bg-[rgba(251,113,133,.10)] px-4 py-3 text-sm">
          {error}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div>
            <div className="pf-kicker">Editor</div>
            <CardTitle className="text-lg">Takeaways and code</CardTitle>
            <CardDescription>Type `/` to insert blocks (headings, lists, quotes, code blocks).</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {initialJSON ? (
            <NotesEditor
              initialJSON={initialJSON}
              onChange={(doc) => {
                // Keep a stable ref so manual Save works even if the debounce hasn't fired yet.
                lastDocRef.current = doc;
                // TipTap fires an update on initial setContent; ignore that.
                if (skipFirstChangeRef.current) {
                  skipFirstChangeRef.current = false;
                  return;
                }
                scheduleSave(doc);
              }}
            />
          ) : (
            <div className="text-sm text-[color:var(--muted)]">Loading…</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!resp.ok) {
        const msg = (await resp.json().catch(() => null))?.error || "Registration failed";
        setError(String(msg));
        return;
      }
      router.replace("/today");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <div className="pf-kicker">PrepTracker</div>
          <CardTitle>Create account</CardTitle>
          <CardDescription>Start tracking and reviewing today.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="text-xs text-[color:var(--muted)]">
              Use something you can remember. This is an MVP, so password reset is not shipped yet.
            </div>
          </div>
          {error ? (
            <div className="rounded-2xl border border-[rgba(180,35,24,.28)] bg-[rgba(180,35,24,.08)] px-4 py-3 text-sm text-[color:var(--foreground)]">
              {error}
            </div>
          ) : null}
          <Button className="w-full" type="submit" disabled={busy}>
            {busy ? "Creating..." : "Create account"}
          </Button>
          <div className="text-sm text-[color:var(--muted)]">
            Already have an account?{" "}
            <Link className="underline decoration-[rgba(15,118,110,.35)] underline-offset-4" href="/login">
              Sign in
            </Link>
            .
          </div>
        </form>
      </CardContent>
    </Card>
  );
}


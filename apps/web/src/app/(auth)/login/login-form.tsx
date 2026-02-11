"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ nextPath }: { nextPath: string }) {
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
      const resp = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!resp.ok) {
        const msg = (await resp.json().catch(() => null))?.error || "Login failed";
        setError(String(msg));
        return;
      }
      router.replace(nextPath || "/today");
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
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Use your email and password.</CardDescription>
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? (
            <div className="rounded-2xl border border-[rgba(180,35,24,.28)] bg-[rgba(180,35,24,.08)] px-4 py-3 text-sm text-[color:var(--foreground)]">
              {error}
            </div>
          ) : null}
          <Button className="w-full" type="submit" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </Button>
          <div className="text-sm text-[color:var(--muted)]">
            New here?{" "}
            <Link className="underline decoration-[rgba(15,118,110,.35)] underline-offset-4" href="/register">
              Create an account
            </Link>
            .
          </div>
        </form>
      </CardContent>
    </Card>
  );
}


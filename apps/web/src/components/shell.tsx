"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { BarChart3, CalendarDays, ListChecks, Rows3, Settings2, Trophy } from "lucide-react";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/today", label: "Today", icon: ListChecks },
  { href: "/library", label: "Library", icon: CalendarDays },
  { href: "/lists", label: "Lists", icon: Rows3 },
  { href: "/contests", label: "Contests", icon: Trophy },
  { href: "/stats", label: "Stats", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings2 },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pf-container">
      <div className="grid items-start gap-5 lg:grid-cols-[260px_1fr]">
        <aside className="pf-paper self-start p-5 lg:sticky lg:top-6 lg:max-h-[calc(100vh-48px)] lg:overflow-auto">
          <div className="mb-5">
            <div className="pf-kicker">PrepFlow</div>
            <div className="flex items-start justify-between gap-3">
              <div className="pf-display text-2xl font-semibold leading-tight">Daily Practice</div>
              <ThemeToggle />
            </div>
            <div className="mt-2 text-sm text-[color:var(--muted)]">
              Track problems. Review on schedule. Stay consistent.
            </div>
          </div>
          <nav className="space-y-2">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition",
                    active
                      ? "border-[rgba(15,118,110,.45)] bg-[rgba(15,118,110,.08)] shadow-[0_10px_22px_rgba(16,24,40,.08)]"
                      : "border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] hover:border-[rgba(15,118,110,.35)] hover:bg-[color:var(--pf-surface)]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-5 pt-5 border-t border-[color:var(--line)]">
            <Button variant="outline" className="w-full" onClick={logout} disabled={busy}>
              Log out
            </Button>
          </div>
        </aside>
        <main className="space-y-5">{children}</main>
      </div>
    </div>
  );
}

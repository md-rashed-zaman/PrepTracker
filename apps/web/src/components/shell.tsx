"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { ArrowLeft, BarChart3, CalendarDays, ListChecks, Menu, Rows3, Settings2, Trophy } from "lucide-react";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

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
  const [menuOpen, setMenuOpen] = React.useState(false);

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

  const tabs = NAV.filter((x) => x.href !== "/settings");
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const inStatsTopic = pathname.startsWith("/stats/topics/");

  return (
    <div className="pf-container pb-[calc(124px+env(safe-area-inset-bottom))] lg:pb-[64px]">
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 pt-2 pb-3">
        <div className="pf-paper p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {inStatsTopic ? (
                  <Link
                    href="/stats"
                    aria-label="Back to Stats"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] transition hover:bg-[color:var(--pf-surface)]"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                ) : null}
                <div className="min-w-0">
                  <div className="pf-kicker">PrepTracker</div>
                  <div className="pf-display truncate text-lg font-semibold leading-tight">Daily Practice</div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 w-9 p-0" aria-label="Menu">
                    <Menu className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Menu</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-2">
                    <Link
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition",
                        isActive("/settings")
                          ? "border-[rgba(15,118,110,.45)] bg-[rgba(15,118,110,.08)]"
                          : "border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] hover:bg-[color:var(--pf-surface)]",
                      )}
                    >
                      <Settings2 className="h-4 w-4" />
                      <span className="font-medium">Settings</span>
                    </Link>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-3 rounded-2xl"
                      onClick={async () => {
                        setMenuOpen(false);
                        await logout();
                      }}
                      disabled={busy}
                    >
                      Log out
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[260px_1fr]">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block pf-paper self-start p-5 lg:sticky lg:top-6">
          <div className="mb-5">
            <div className="pf-kicker">PrepTracker</div>
            <div className="flex items-start justify-between gap-3">
              <div className="pf-display text-2xl font-semibold leading-tight">Daily Practice</div>
              <ThemeToggle />
            </div>
            <div className="mt-2 text-sm text-[color:var(--muted)]">Track problems. Review on schedule. Stay consistent.</div>
          </div>
          <nav className="space-y-2">
            {NAV.map((item) => {
              const active = isActive(item.href);
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
          <div className="mt-5 border-t border-[color:var(--line)] pt-5">
            <Button variant="outline" className="w-full" onClick={logout} disabled={busy}>
              Log out
            </Button>
          </div>
        </aside>

        <main className="space-y-5">{children}</main>
      </div>

      {/* Mobile bottom tabs */}
      <nav
        className="lg:hidden fixed bottom-3 left-5 right-5 z-40 pf-paper px-2 py-2 pb-[calc(8px+env(safe-area-inset-bottom))]"
        aria-label="Primary"
        data-testid="mobile-tabs"
      >
        <div className="grid grid-cols-5 gap-1">
          {tabs.map((t) => {
            const active = isActive(t.href);
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-label={t.label}
                data-testid={`mobile-tab-${t.href.slice(1)}`}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-[11px] leading-none transition",
                  active
                    ? "border-[rgba(15,118,110,.45)] bg-[rgba(15,118,110,.08)]"
                    : "border-transparent bg-transparent hover:border-[color:var(--line)] hover:bg-[color:var(--pf-surface-weak)]",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="font-medium">{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export type Difficulty = "easy" | "medium" | "hard" | "unknown";

export function normalizeDifficulty(raw: string): Difficulty {
  const v = (raw || "").trim().toLowerCase();
  if (v === "easy" || v === "medium" || v === "hard") return v;
  return "unknown";
}

export function difficultyChip(raw?: string): { label: string; tone: string } | null {
  if (!raw) return null;
  const d = normalizeDifficulty(raw);
  switch (d) {
    case "easy":
      return { label: "Easy", tone: "border-[rgba(52,211,153,.28)] bg-[rgba(52,211,153,.10)]" };
    case "medium":
      return { label: "Medium", tone: "border-[rgba(251,191,36,.28)] bg-[rgba(251,191,36,.10)]" };
    case "hard":
      return { label: "Hard", tone: "border-[rgba(251,113,133,.28)] bg-[rgba(251,113,133,.10)]" };
    default:
      return { label: raw, tone: "border-[color:var(--line)] bg-[color:var(--pf-chip-bg)]" };
  }
}


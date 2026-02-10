export function gradeTone(g: number) {
  // Distinct but consistent across pages:
  // 0 fail (rose), 1 hints (orange), 2 shaky (amber), 3 solid (teal), 4 ace (emerald).
  switch (g) {
    case 0:
      return "border-[rgba(251,113,133,.28)] bg-[rgba(251,113,133,.12)] hover:bg-[rgba(251,113,133,.18)]";
    case 1:
      return "border-[rgba(249,115,22,.28)] bg-[rgba(249,115,22,.10)] hover:bg-[rgba(249,115,22,.16)]";
    case 2:
      return "border-[rgba(251,191,36,.28)] bg-[rgba(251,191,36,.12)] hover:bg-[rgba(251,191,36,.18)]";
    case 3:
      return "border-[rgba(45,212,191,.28)] bg-[rgba(45,212,191,.14)] hover:bg-[rgba(45,212,191,.20)]";
    case 4:
      return "border-[rgba(52,211,153,.28)] bg-[rgba(52,211,153,.12)] hover:bg-[rgba(52,211,153,.18)]";
    default:
      return "border-[color:var(--line)] bg-[color:var(--pf-surface-weak)] hover:bg-[color:var(--pf-surface)]";
  }
}

export function gradeHint(g: number) {
  switch (g) {
    case 0:
      return "0 — Blank / wrong approach";
    case 1:
      return "1 — Needed solution / heavy hints";
    case 2:
      return "2 — Solved but struggled";
    case 3:
      return "3 — Clean within time";
    case 4:
      return "4 — Fast + confident";
    default:
      return `Grade ${g}`;
  }
}

import type { FocusStats } from "../db";
import { formatMinutes } from "../timer/heuristic";

/** Compact stat strip for the idle/setup screen. */
export function Stats({ stats }: { stats: FocusStats | null }) {
  if (!stats) return null;
  return (
    <div
      className="grid grid-cols-3 border-t-2"
      style={{ borderColor: "var(--color-ink)" }}
    >
      <Cell label="today" value={formatMinutes(stats.todayFocusSeconds)} />
      <Cell label="sessions" value={String(stats.todaySessions)} />
      <Cell label="streak" value={`${stats.streakDays}d`} />
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-3" style={{ borderRight: "1px solid var(--color-rule)" }}>
      <div
        className="text-[10px] font-bold uppercase tracking-[0.2em]"
        style={{ color: "var(--color-ink-soft)" }}
      >
        {label}
      </div>
      <div className="tabular mt-1 text-xl font-extrabold">{value}</div>
    </div>
  );
}

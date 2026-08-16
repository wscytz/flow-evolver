import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { SessionRow } from "../db";
import { RATING_DEFS } from "../timer/heuristic";
import type { RatingKey } from "../timer/reducer";

/**
 * History sheet — the sessions table finally gets a face. Newest-first list of
 * recent focus/rest intervals: what, how long, how it went. Same sheet pattern
 * as Rating/Settings (absolute, z-20, plain div outside App's AnimatePresence).
 *
 * Scrolling lives INSIDE the sheet (max-h + overflow-y-auto) — the app root is
 * overflow-hidden with no page scroll, so a long list must scroll in its own
 * box or the tail would be unreachable.
 */
export function HistorySheet({
  show,
  onClose,
  load,
}: {
  show: boolean;
  onClose: () => void;
  load: () => Promise<SessionRow[]>;
}) {
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (show) {
      setRows(null);
      setFailed(false);
      load()
        .then((r) => {
          if (alive) setRows(r);
        })
        .catch(() => {
          if (alive) setFailed(true);
        });
    }
    return () => {
      alive = false;
    };
  }, [show, load]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 160, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 160, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="absolute inset-x-0 bottom-0 z-20 flex max-h-full flex-col border-t-2 bg-[var(--color-bg)]"
          style={{ borderColor: "var(--color-ink)" }}
          role="dialog"
          aria-label="历史记录"
        >
          <div className="flex items-baseline justify-between p-4 pb-3">
            <h2 className="text-lg font-extrabold uppercase tracking-tight">历史</h2>
            <button
              onClick={onClose}
              className="text-xs font-bold uppercase tracking-[0.2em]"
              style={{ color: "var(--color-ink-soft)" }}
            >
              关闭
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {failed && <Empty>读取失败</Empty>}
            {!failed && rows === null && <Empty>读取中…</Empty>}
            {!failed && rows !== null && rows.length === 0 && (
              <Empty>还没有记录。开始第一次专注吧。</Empty>
            )}
            {!failed && rows !== null && rows.length > 0 && (
              <ul className="flex flex-col">
                {rows.map((r) => (
                  <Row key={r.id} row={r} />
                ))}
              </ul>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Row({ row }: { row: SessionRow }) {
  const isFocus = row.kind === "focus";
  // Local calendar date+time — a UTC render would shuffle sessions across the
  // day boundary the streak logic carefully keeps local.
  const d = new Date(row.ended_at);
  const when = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const mins = Math.max(1, Math.round(row.actual_seconds / 60));
  const rating = row.rating_key as RatingKey | null;
  const ratingDef = rating && rating in RATING_DEFS ? RATING_DEFS[rating] : null;

  return (
    <li
      className="flex items-baseline gap-2 border-b py-2"
      style={{ borderColor: "var(--color-rule)" }}
    >
      <span
        className="tabular shrink-0 text-[11px]"
        style={{ color: "var(--color-ink-soft)" }}
      >
        {when}
      </span>
      <span
        className="min-w-0 flex-1 truncate text-xs font-bold"
        style={{ color: isFocus ? "var(--color-ink)" : "var(--color-ink-soft)" }}
      >
        {isFocus ? row.task_label || "专注" : "休息"}
      </span>
      {row.auto_flowed === 1 && (
        <span
          className="shrink-0 text-[10px] font-extrabold uppercase tracking-[0.15em]"
          style={{ color: "var(--color-accent)" }}
          title="超过目标继续专注(自动流)"
        >
          自动流
        </span>
      )}
      {ratingDef && (
        <span className="shrink-0 text-[10px] font-extrabold" style={{ color: "var(--color-ink)" }}>
          {ratingDef.label}
        </span>
      )}
      <span
        className="tabular shrink-0 text-xs font-extrabold"
        style={{ color: "var(--color-ink)" }}
      >
        {mins}分
      </span>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="py-8 text-center text-xs font-bold uppercase tracking-[0.2em]"
      style={{ color: "var(--color-ink-soft)" }}
    >
      {children}
    </p>
  );
}

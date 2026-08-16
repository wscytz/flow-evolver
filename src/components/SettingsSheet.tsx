import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { parseSettings, type SettingsInput } from "../settings";
import type { FocusConfig } from "../timer/reducer";

/**
 * Settings sheet — the tuning surface the heuristic's clamp bounds were
 * missing. Slides up over the idle screen (same sheet pattern as Rating:
 * plain absolute div, z-20 above main's z-10, outside AnimatePresence in App).
 *
 * Edits are in MINUTES; parseSettings validates/clamps, saveConfigSettings
 * persists seconds. The immediate apply path (setConfig) keeps the next
 * session correct even if the DB write is still in flight.
 */
export function SettingsSheet({
  show,
  config,
  onClose,
  onSave,
}: {
  show: boolean;
  config: FocusConfig | null;
  onClose: () => void;
  onSave: (input: SettingsInput) => Promise<boolean>;
}) {
  // Local draft state, seeded from the live config each time the sheet opens.
  // Edits don't touch config until 保存 passes parseSettings.
  const [draft, setDraft] = useState<SettingsInput | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (show && config) {
      setDraft({
        focusTarget: Math.round(config.focusTarget / 60),
        focusMin: Math.round(config.focusMin / 60),
        focusMax: Math.round(config.focusMax / 60),
        // ratio 0.2 with denominator 25 → numerator 5; we keep the *display*
        // denominator at a fixed 25-min convention for the UI ("每 25 分钟专注
        // 休 5 分钟"), rather than the stored denominator which may be exotic.
        restMinutes: Math.round(config.restRatio * 25),
        perFocusMinutes: 25,
      });
      setError(null);
    }
  }, [show, config]);

  const save = async () => {
    if (!draft) return;
    const parsed = parseSettings(draft);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setBusy(true);
    const ok = await onSave(parsed.values);
    setBusy(false);
    if (ok) onClose();
    else setError("保存失败,请重试");
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 160, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 160, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="absolute inset-x-0 bottom-0 z-20 max-h-full overflow-y-auto border-t-2 bg-[var(--color-bg)] p-4"
          style={{ borderColor: "var(--color-ink)" }}
          role="dialog"
          aria-label="设置"
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-extrabold uppercase tracking-tight">设置</h2>
            <button
              onClick={onClose}
              className="text-xs font-bold uppercase tracking-[0.2em]"
              style={{ color: "var(--color-ink-soft)" }}
            >
              关闭
            </button>
          </div>

          {draft && (
            <div className="flex flex-col gap-3">
              <Field
                label="下次专注目标"
                value={draft.focusTarget}
                onChange={(v) => setDraft({ ...draft, focusTarget: v })}
                suffix="分钟"
              />
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="下限"
                  value={draft.focusMin}
                  onChange={(v) => setDraft({ ...draft, focusMin: v })}
                  suffix="分钟"
                />
                <Field
                  label="上限"
                  value={draft.focusMax}
                  onChange={(v) => setDraft({ ...draft, focusMax: v })}
                  suffix="分钟"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="每专注"
                  value={draft.perFocusMinutes}
                  onChange={(v) => setDraft({ ...draft, perFocusMinutes: v })}
                  suffix="分钟休"
                />
                <Field
                  label="可得休息"
                  value={draft.restMinutes}
                  onChange={(v) => setDraft({ ...draft, restMinutes: v })}
                  suffix="分钟"
                />
              </div>
              <p
                className="text-[11px] leading-tight"
                style={{ color: "var(--color-ink-soft)" }}
              >
                评分在上下限内调整目标:心流 +10 / 专注 +5 / 一般 ±0 / 分心 −5 分钟。
              </p>
              {error && (
                <p className="text-xs font-bold" style={{ color: "var(--color-ink)" }} role="alert">
                  {error}
                </p>
              )}
              <button
                onClick={save}
                disabled={busy}
                className="mt-1 w-full border-2 py-3 text-xs font-extrabold uppercase tracking-[0.25em] transition-transform active:translate-y-0.5 disabled:opacity-50"
                style={{
                  borderColor: "var(--color-ink)",
                  background: "var(--color-accent)",
                  color: "#fff",
                }}
              >
                {busy ? "保存中…" : "保存"}
              </button>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix: string;
}) {
  return (
    <label className="flex items-baseline justify-between gap-2">
      <span className="text-xs font-bold" style={{ color: "var(--color-ink)" }}>
        {label}
      </span>
      <span className="flex items-baseline gap-1">
        <input
          type="number"
          inputMode="numeric"
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) =>
            // Empty field → NaN (NOT Number("") === 0): the user is mid-edit,
            // and a cleared box snapping the draft to 0 would clamp-save a
            // garbage bound on the next tap. NaN keeps it empty and lets
            // parseSettings reject the save with "请输入有效的数字".
            onChange(e.target.value === "" ? Number.NaN : Number(e.target.value))
          }
          aria-label={label}
          className="tabular w-16 border-b-2 bg-transparent py-1 text-right text-base font-extrabold"
          style={{ borderColor: "var(--color-ink)" }}
        />
        <span className="text-[11px]" style={{ color: "var(--color-ink-soft)" }}>
          {suffix}
        </span>
      </span>
    </label>
  );
}

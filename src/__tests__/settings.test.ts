import { describe, it, expect } from "vitest";
import { parseSettings, type SettingsInput } from "../settings";

/*
 * parseSettings is the only gate between the settings UI and the settings
 * table — its contract is: what it approves, loadConfig round-trips without
 * repair. These tests pin the validation bands and the cross-field rule.
 */
const base: SettingsInput = {
  focusTarget: 25,
  focusMin: 10,
  focusMax: 90,
  restMinutes: 5,
  perFocusMinutes: 25,
};

describe("parseSettings", () => {
  it("passes through a sane input unchanged", () => {
    const r = parseSettings(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values).toEqual(base);
  });

  it("rejects non-finite input (cleared/typed garbage → NaN)", () => {
    // The Field input maps a cleared box to NaN (not Number("") === 0); a
    // non-numeric string also produces NaN. Both must fail validation, not
    // clamp-save a garbage bound.
    expect(parseSettings({ ...base, focusMin: Number.NaN }).ok).toBe(false);
    expect(parseSettings({ ...base, focusMax: Number("abc") }).ok).toBe(false);
    const r = parseSettings({ ...base, restMinutes: Number.NaN });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBeTruthy();
  });

  it("rejects max <= min (would freeze the heuristic clamp)", () => {
    expect(parseSettings({ ...base, focusMax: 10 }).ok).toBe(false);
    expect(parseSettings({ ...base, focusMin: 90, focusMax: 90 }).ok).toBe(false);
    expect(parseSettings({ ...base, focusMin: 100, focusMax: 90 }).ok).toBe(false);
  });

  it("clamps each field into its band", () => {
    const r = parseSettings({ ...base, focusMax: 99999, restMinutes: -3, perFocusMinutes: 0 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.focusMax).toBe(1440);
      expect(r.values.restMinutes).toBe(0);
      expect(r.values.perFocusMinutes).toBe(1);
    }
  });

  it("clamps the target into the (possibly new) [min, max] window", () => {
    const r = parseSettings({ ...base, focusTarget: 500 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.values.focusTarget).toBe(90);
    const r2 = parseSettings({ ...base, focusTarget: 1 });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.values.focusTarget).toBe(10);
  });

  it("rounds fractional input to integers", () => {
    const r = parseSettings({ ...base, focusTarget: 25.6, restMinutes: 5.4 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.values.focusTarget).toBe(26);
      expect(r.values.restMinutes).toBe(5);
    }
  });

  it("approved values always satisfy min < target-band <= max (loadConfig round-trip)", () => {
    // Property-style check across the boundary cases the clamps can produce.
    for (const t of [1, 5, 10, 25, 90, 100, 1440]) {
      const r = parseSettings({ ...base, focusTarget: t });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.values.focusTarget).toBeGreaterThanOrEqual(r.values.focusMin);
        expect(r.values.focusTarget).toBeLessThanOrEqual(r.values.focusMax);
      }
    }
  });
});

/**
 * SQLite access via tauri-plugin-sql.
 *
 * The connection is loaded once and cached. Migrations are registered Rust-side
 * (src-tauri/src/lib.rs) and applied when `Database.load` is first called.
 *
 * We keep ALL timer/state logic out of SQL — the DB is just durable storage for
 * (a) the tunable "next focus target" so it survives restarts, and
 * (b) a session log for the stats view.
 */
import Database from "@tauri-apps/plugin-sql";
import type { SessionRecord, FocusConfig } from "./timer/reducer";

let dbPromise: Promise<Database> | null = null;

function db(): Promise<Database> {
  if (!dbPromise) {
    // If the first load rejects (disk full / permissions / a bad migration),
    // DON'T cache the rejected promise — every later db() call would return the
    // same rejection and silently fail every persist for the whole session. Reset
    // on failure so the next attempt can retry.
    dbPromise = Database.load("sqlite:flow-evolver.db").catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

export async function loadConfig(): Promise<FocusConfig> {
  const conn = await db();
  const rows = (await conn.select<{ key: string; value: string }[]>(
    "SELECT key, value FROM settings",
  )) ?? [];

  // Guard against a corrupted/NaN row: Number("garbage") is NaN and would
  // poison the heuristic target, then get written back as "NaN". Fall back to
  // the default on anything non-finite or out of a sane range.
  const safeNumber = (k: string, fallback: number, min: number, max: number): number => {
    const r = rows.find((row) => row.key === k);
    if (!r) return fallback;
    const n = Number(r.value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, n));
  };

  let focusTarget = safeNumber("focus_target_seconds", 1500, 60, 86400);
  let focusMin = safeNumber("focus_target_min", 600, 60, 86400);
  let focusMax = safeNumber("focus_target_max", 5400, 60, 86400);
  const num = safeNumber("rest_ratio_numerator", 5, 0, 1000);
  const den = safeNumber("rest_ratio_denominator", 25, 1, 1000);

  // A min above max would make every clamp land on min forever — repair the
  // bounds so the heuristic can actually move the target.
  if (focusMin > focusMax) {
    const lo = Math.min(focusMin, focusMax);
    focusMax = Math.max(focusMin, focusMax);
    focusMin = lo;
  }
  // focusTarget passed safeNumber with a [60, 86400] band, but the heuristic
  // lives in [focusMin, focusMax]. A stray stored value inside the wider band
  // (manual edit / old version) would otherwise become a 2-minute session.
  focusTarget = Math.max(focusMin, Math.min(focusMax, focusTarget));

  return { focusTarget, focusMin, focusMax, restRatio: num / den };
}

/** Persist the heuristic's newly-computed next focus target. */
export async function saveFocusTarget(seconds: number): Promise<void> {
  await saveSetting("focus_target_seconds", String(seconds));
}

/**
 * Persist all heuristic tunables from the settings panel at once. Same UPSERT
 * contract as saveFocusTarget: a missing row must be created, not silently
 * skipped by a 0-row UPDATE. The panel only ever sees values that came out of
 * parseSettings, so seconds-conversion here is trusted input.
 */
export async function saveConfigSettings(cfg: {
  focusTargetMin: number;
  focusMinMin: number;
  focusMaxMin: number;
  restMinutes: number;
  perFocusMinutes: number;
}): Promise<void> {
  const conn = await db();
  // One transaction: a settings row half-written (app killed mid-save) would
  // leave min/max/ratio disagreeing with each other — loadConfig's repair
  // bands can fix min>max but can't guess the user's intended ratio.
  const rows: Array<[string, string]> = [
    ["focus_target_seconds", String(Math.round(cfg.focusTargetMin * 60))],
    ["focus_target_min", String(Math.round(cfg.focusMinMin * 60))],
    ["focus_target_max", String(Math.round(cfg.focusMaxMin * 60))],
    ["rest_ratio_numerator", String(Math.round(cfg.restMinutes))],
    ["rest_ratio_denominator", String(Math.round(cfg.perFocusMinutes))],
  ];
  await conn.execute("BEGIN");
  try {
    for (const [key, value] of rows) {
      await conn.execute(
        `INSERT INTO settings(key, value) VALUES ($1, $2)
         ON CONFLICT(key) DO UPDATE SET value = $2`,
        [key, value],
      );
    }
    await conn.execute("COMMIT");
  } catch (e) {
    await conn.execute("ROLLBACK");
    throw e;
  }
}

// UPSERT, not a bare UPDATE: if the row is ever missing (drift, manual edit),
// an UPDATE would affect 0 rows and silently diverge from the in-memory value
// until restart. INSERT ... ON CONFLICT guarantees the write lands either way.
async function saveSetting(key: string, value: string): Promise<void> {
  const conn = await db();
  await conn.execute(
    `INSERT INTO settings(key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = $2`,
    [key, value],
  );
}

/** Recent focus/rest intervals for the history panel, newest first. */
export async function getRecentSessions(
  limit = 30,
): Promise<SessionRow[]> {
  const conn = await db();
  const rows = (await conn.select<SessionRow[]>(
    `SELECT id, kind, task_label, target_seconds, actual_seconds, auto_flowed,
            rating_key, rating_delta, started_at, ended_at
     FROM sessions ORDER BY id DESC LIMIT $1`,
    [limit],
  )) ?? [];
  return rows;
}

export async function insertSession(rec: SessionRecord): Promise<void> {
  const conn = await db();
  await conn.execute(
    `INSERT INTO sessions
       (kind, task_label, target_seconds, actual_seconds, auto_flowed,
        rating_key, rating_delta, started_at, ended_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      rec.kind,
      rec.taskLabel,
      rec.targetSeconds,
      rec.actualSeconds,
      rec.autoFlowed ? 1 : 0,
      rec.ratingKey,
      rec.ratingDelta,
      rec.startedAt,
      rec.endedAt,
    ],
  );
}

export interface SessionRow {
  id: number;
  kind: string;
  task_label: string | null;
  target_seconds: number;
  actual_seconds: number;
  auto_flowed: number;
  rating_key: string | null;
  rating_delta: number | null;
  started_at: number;
  ended_at: number;
}

export interface FocusStats {
  todayFocusSeconds: number;
  todaySessions: number;
  totalFocusSeconds: number;
  streakDays: number;
}

export async function getStats(now: number): Promise<FocusStats> {
  const conn = await db();

  // "Today" and the streak MUST use the same local-day index. Using UTC day
  // indices (ended_at / 86400000) while "today" uses local midnight drifts
  // apart: in UTC+8 a session ending after 20:00 local is already UTC+1 day,
  // so the streak would count it as "tomorrow" and break an otherwise-unbroken
  // run. Fix: shift ended_at by the local timezone offset (minutes) so both
  // boundaries agree on the user's calendar day.
  const tzOffsetMinutes = new Date(now).getTimezoneOffset();

  const localStartOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const startOfToday = localStartOfDay(now);

  const today = (await conn.select<{ total: number; n: number }[]>(
    `SELECT COALESCE(SUM(actual_seconds),0) AS total, COUNT(*) AS n
     FROM sessions WHERE kind='focus' AND ended_at >= $1`,
    [startOfToday],
  )) ?? [];

  const total = (await conn.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(actual_seconds),0) AS total FROM sessions WHERE kind='focus'`,
  )) ?? [];

  // streak: count consecutive local calendar days (ending today or yesterday)
  // with >=1 focus session. Day index computed in JS as
  //   localDayIndex(ms) = Math.floor((ms - tzOffset)/86400000)
  // which matches the localStartOfDay boundary used for "today" above.
  // We pull raw ended_at timestamps and derive indices here — doing the shift
  // in SQL is a foot-gun (SQLite INTEGER division truncates, and DISTINCT over
  // a float index wouldn't match the JS floor). The volume is small.
  const ended = (await conn.select<{ e: number }[]>(
    `SELECT ended_at AS e FROM sessions WHERE kind='focus'`,
  )) ?? [];

  const localDay = (ms: number) => Math.floor((ms - tzOffsetMinutes * 60 * 1000) / 86400000);
  const todayIdx = localDay(now);
  const daySet = new Set(ended.map((r) => localDay(r.e)));
  let streak = 0;
  let cursor = todayIdx;
  // allow streak to count if there's a session today OR yesterday as the seed
  if (!daySet.has(cursor)) cursor -= 1; // grace: if nothing today, keep streak from yesterday
  while (daySet.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }

  return {
    todayFocusSeconds: today[0]?.total ?? 0,
    todaySessions: today[0]?.n ?? 0,
    totalFocusSeconds: total[0]?.total ?? 0,
    streakDays: streak,
  };
}

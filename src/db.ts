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
    dbPromise = Database.load("sqlite:flow-evolver.db");
  }
  return dbPromise;
}

export async function loadConfig(): Promise<FocusConfig> {
  const conn = await db();
  const rows = (await conn.select<{ key: string; value: string }[]>(
    "SELECT key, value FROM settings",
  )) ?? [];

  const get = (k: string, fallback: number): number => {
    const r = rows.find((row) => row.key === k);
    return r ? Number(r.value) : fallback;
  };

  const focusTarget = get("focus_target_seconds", 1500);
  const focusMin = get("focus_target_min", 600);
  const focusMax = get("focus_target_max", 5400);
  const num = get("rest_ratio_numerator", 5);
  const den = get("rest_ratio_denominator", 25);

  return { focusTarget, focusMin, focusMax, restRatio: den === 0 ? 0.2 : num / den };
}

/** Persist the heuristic's newly-computed next focus target. */
export async function saveFocusTarget(seconds: number): Promise<void> {
  const conn = await db();
  await conn.execute("UPDATE settings SET value = $1 WHERE key = 'focus_target_seconds'", [
    String(seconds),
  ]);
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

  const utcStartOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const startOfToday = utcStartOfDay(now);

  const today = (await conn.select<{ total: number; n: number }[]>(
    `SELECT COALESCE(SUM(actual_seconds),0) AS total, COUNT(*) AS n
     FROM sessions WHERE kind='focus' AND ended_at >= $1`,
    [startOfToday],
  )) ?? [];

  const total = (await conn.select<{ total: number }[]>(
    `SELECT COALESCE(SUM(actual_seconds),0) AS total FROM sessions WHERE kind='focus'`,
  )) ?? [];

  // streak: count consecutive days (ending today or yesterday) with >=1 focus session.
  const days = (await conn.select<{ d: number }[]>(
    `SELECT DISTINCT (ended_at / 86400000) AS d FROM sessions WHERE kind='focus' ORDER BY d DESC LIMIT 400`,
  )) ?? [];

  const todayIdx = Math.floor(now / 86400000);
  let streak = 0;
  let cursor = todayIdx;
  // allow streak to count if there's a session today OR yesterday as the seed
  const daySet = new Set(days.map((r) => r.d));
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

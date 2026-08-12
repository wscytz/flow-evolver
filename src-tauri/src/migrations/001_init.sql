-- One row per completed (or explicitly stopped) focus or rest interval.
CREATE TABLE sessions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    kind          TEXT    NOT NULL,          -- 'focus' | 'rest'
    task_label    TEXT,                      -- free-text context tag, nullable
    -- Planned target in seconds. For auto-flow focus sessions this is the
    -- ORIGINAL pomodoro target; actual_seconds captures how long it really ran.
    target_seconds   INTEGER NOT NULL,
    actual_seconds   INTEGER NOT NULL,       -- how long the interval actually lasted
    auto_flowed      INTEGER NOT NULL DEFAULT 0,  -- 1 if focus ran past target silently
    -- Heuristic rating the user gave at the end of a focus session.
    -- rating_delta is the signed minute adjustment applied to the next target.
    rating_key       TEXT,                   -- 'flow' | 'focus' | 'good' | 'distracted' | NULL
    rating_delta     INTEGER,                -- minutes, signed
    started_at       INTEGER NOT NULL,       -- epoch ms
    ended_at         INTEGER NOT NULL        -- epoch ms
);

CREATE INDEX idx_sessions_started ON sessions(started_at DESC);
CREATE INDEX idx_sessions_kind    ON sessions(kind);

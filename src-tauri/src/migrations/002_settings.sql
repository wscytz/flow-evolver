-- Key/value store for tunables the heuristic reads/writes.
-- The single source of truth for "what is the next focus target".
CREATE TABLE settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);

INSERT OR IGNORE INTO settings(key, value) VALUES
    -- next focus target in seconds; default 25 min (a classic pomodoro baseline
    -- the heuristic immediately starts nudging away from as ratings come in)
    ('focus_target_seconds', '1500'),
    -- clamp bounds in seconds for the target
    ('focus_target_min', '600'),
    ('focus_target_max', '5400'),
    -- rest is derived from the just-finished focus length
    ('rest_ratio_numerator', '5'),     -- rest minutes per …
    ('rest_ratio_denominator', '25');  -- … focus minutes

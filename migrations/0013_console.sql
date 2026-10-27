-- The owner's private console (functions/_console.js): every sign-in try, so five wrong tries lock it for an hour. No passcode, no address typed, no IP is kept (only whether the try was right).
-- Rows older than 7 days are deleted by the next sign-in. Safe to repeat.
CREATE TABLE IF NOT EXISTS console_attempt (id INTEGER PRIMARY KEY AUTOINCREMENT, at_ms INTEGER NOT NULL, ok INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS console_attempt_at ON console_attempt (at_ms);

-- Agrupación persistente de push. LOCAL ONLY.
-- NO aplicar a D1 remoto / producción sin autorización explícita.
-- Única fuente del esquema: aplicar esta migración ANTES del deploy del Worker.
-- El Worker ya no crea push_batches en runtime.

CREATE TABLE IF NOT EXISTS push_batches (
  group_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  recipient_user_id TEXT NOT NULL,
  target_id TEXT,
  first_actor_id TEXT,
  first_actor_name TEXT,
  actor_ids TEXT NOT NULL DEFAULT '[]',
  subject_names TEXT NOT NULL DEFAULT '[]',
  extra TEXT,
  first_push_sent INTEGER NOT NULL DEFAULT 0,
  first_event_at INTEGER NOT NULL,
  last_event_at INTEGER NOT NULL,
  window_ends_at INTEGER NOT NULL,
  flushed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_push_batches_due
  ON push_batches (flushed_at, window_ends_at);

/**
 * SQL de Reels. Debe coincidir con migrations/001_reels.sql.
 * La migración es la fuente de verdad para aplicar el esquema en D1.
 * El Worker solo ejecuta estos statements si REELS_SCHEMA_APPLY === '1'.
 */
export const REELS_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS reels (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  author_profile_id TEXT,
  pet_id TEXT,
  caption TEXT DEFAULT '',
  mux_upload_id TEXT,
  mux_asset_id TEXT,
  mux_playback_id TEXT,
  status TEXT NOT NULL,
  moderation TEXT NOT NULL DEFAULT 'none',
  duration_ms INTEGER,
  width INTEGER,
  height INTEGER,
  error TEXT,
  mux_last_event_id TEXT,
  cleanup_needed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  ready_at INTEGER,
  deleted_at INTEGER
)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_reels_mux_upload
  ON reels (mux_upload_id) WHERE mux_upload_id IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_reels_feed
  ON reels (status, deleted_at, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_reels_user
  ON reels (user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_reels_asset
  ON reels (mux_asset_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reels_cleanup
  ON reels (cleanup_needed, status)`,
  `CREATE TABLE IF NOT EXISTS reel_likes (
  user_id TEXT NOT NULL,
  reel_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, reel_id)
)`,
  `CREATE TABLE IF NOT EXISTS reel_comments (
  id TEXT PRIMARY KEY,
  reel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_reel_comments_reel
  ON reel_comments (reel_id, created_at ASC)`,
  `CREATE TABLE IF NOT EXISTS reel_upload_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_reel_upload_attempts_user
  ON reel_upload_attempts (user_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS mux_webhook_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  reel_id TEXT,
  created_at INTEGER NOT NULL
)`,
] as const;

export function reelsSchemaApplyEnabled(flag: string | undefined | null): boolean {
  return String(flag || '') === '1';
}

export function normalizeSql(sql: string): string {
  return String(sql)
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/;\s*$/g, '')
    .trim();
}

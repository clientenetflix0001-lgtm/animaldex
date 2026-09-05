/**
 * SQL de Stories. Debe coincidir con migrations/010_stories.sql.
 * El Worker solo ejecuta estos statements si STORIES_SCHEMA_APPLY === '1'.
 * No aplicar en D1 remoto salvo autorización explícita.
 */
export const STORIES_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS stories (
  id TEXT PRIMARY KEY,
  author_user_id TEXT NOT NULL,
  author_profile_id TEXT,
  author_pet_id TEXT,
  protagonist_pet_id TEXT,
  media_type TEXT NOT NULL,
  image_url TEXT,
  image_cf_id TEXT,
  mux_upload_id TEXT,
  mux_asset_id TEXT,
  mux_playback_id TEXT,
  mux_last_event_id TEXT,
  duration_ms INTEGER,
  caption TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  audience TEXT NOT NULL DEFAULT 'normal',
  breed_species TEXT,
  breed_key TEXT,
  breed_label TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  deleted_at INTEGER,
  media_deleted_at INTEGER,
  cleanup_needed INTEGER NOT NULL DEFAULT 0,
  cleanup_attempts INTEGER NOT NULL DEFAULT 0,
  last_cleanup_error TEXT
)`,
  `CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at, status)`,
  `CREATE INDEX IF NOT EXISTS idx_stories_author_user ON stories(author_user_id, expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_stories_author_profile ON stories(author_profile_id, expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_stories_author_pet ON stories(author_pet_id, expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_stories_breed ON stories(breed_species, breed_key, expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_stories_cleanup ON stories(cleanup_needed, media_deleted_at, expires_at)`,
  `CREATE TABLE IF NOT EXISTS story_views (
  user_id TEXT NOT NULL,
  story_id TEXT NOT NULL,
  viewed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, story_id)
)`,
  `CREATE INDEX IF NOT EXISTS idx_story_views_story ON story_views(story_id, viewed_at)`,
  `CREATE TABLE IF NOT EXISTS story_comments (
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_story_comments_story ON story_comments(story_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS content_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
)`,
] as const;

export function storiesSchemaApplyEnabled(flag: string | undefined | null): boolean {
  return String(flag || '') === '1';
}

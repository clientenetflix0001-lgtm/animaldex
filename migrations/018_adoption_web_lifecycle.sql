-- Animaldex — Adopciones web: ciclo de vida y publicaciones sin cuenta
-- ============================================================
-- PREPARADA. NO ejecutar contra D1 remoto sin autorización.
--
-- Migración ADITIVA sobre `alerts` (no crea un sistema paralelo).
--   media_kind  'photo' | 'flyer' | NULL   (NULL = alerta creada como hoy)
--   is_guest    1 = publicada sin cuenta; NULL/0 = usuario registrado
--   expires_at  ms epoch. NULL = sin vencimiento (todas las filas actuales)
--   paused_at   ms epoch. NULL = no pausada
--
-- Sin backfill: las filas existentes quedan en NULL y conservan su
-- comportamiento (perdidos, avistados, encontrados y adopciones actuales).
--
-- adoption_guest_tokens guarda SOLO el hash SHA-256 del token de gestión.
-- El límite por IP vive aparte (019_adoption_guest_rate.sql).
-- ============================================================

ALTER TABLE alerts ADD COLUMN media_kind TEXT;
ALTER TABLE alerts ADD COLUMN is_guest INTEGER;
ALTER TABLE alerts ADD COLUMN expires_at INTEGER;
ALTER TABLE alerts ADD COLUMN paused_at INTEGER;

CREATE TABLE IF NOT EXISTS adoption_guest_tokens (
  alert_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alerts_type_place ON alerts (type, place_id);
CREATE INDEX IF NOT EXISTS idx_alerts_guest_expiry ON alerts (is_guest, expires_at);

-- Ya existe si se aplicó 010_stories.sql; IF NOT EXISTS lo deja intacto.
CREATE TABLE IF NOT EXISTS content_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_reports_target ON content_reports (target_type, target_id);

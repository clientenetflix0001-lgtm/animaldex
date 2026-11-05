-- Animaldex — Adopciones web: ciclo de vida
-- ============================================================
-- PREPARADA. NO ejecutar contra D1 remoto sin autorización.
--
-- Migración ADITIVA sobre `alerts` (no crea un sistema paralelo).
--   media_kind  'photo' | 'flyer' | NULL   (NULL = alerta creada como hoy)
--   expires_at  ms epoch. NULL = sin vencimiento (todas las filas actuales)
--   paused_at   ms epoch. NULL = no pausada
--
-- Publicar exige una cuenta. No hay columnas ni tablas de invitados.
-- Sin backfill: las filas existentes quedan en NULL y conservan su
-- comportamiento (perdidos, avistados, encontrados y adopciones actuales).
-- El vencimiento oculta la publicación del muro. No la borra: el dueño
-- puede renovarla.
-- ============================================================

ALTER TABLE alerts ADD COLUMN media_kind TEXT;
ALTER TABLE alerts ADD COLUMN expires_at INTEGER;
ALTER TABLE alerts ADD COLUMN paused_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_alerts_type_place ON alerts (type, place_id);

-- Ya existe si se aplicó 010_stories.sql; IF NOT EXISTS lo deja intacto.
CREATE TABLE IF NOT EXISTS content_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_reports_target ON content_reports (target_type, target_id);

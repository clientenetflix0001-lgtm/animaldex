-- Animaldex — Adopciones web: cola durable de borrado de imágenes
-- ============================================================
-- PREPARADA. NO ejecutar contra D1 remoto sin autorización.
-- Aplicar después de 018_adoption_web_lifecycle.sql.
-- No depende de 019. No modifica tablas ni datos existentes.
--
-- Antes de borrar una publicación de esta sección, el Worker inserta acá
-- la imagen (misma transacción D1 que el DELETE de la alerta). Si Cloudflare
-- Images falla o el Worker se corta, la referencia sigue y el cron reintenta.
--
-- status:
--   pending  falta borrar, o hay que reintentar (next_attempt_at)
--   done     Cloudflare confirmó el borrado, la imagen ya no existía,
--            o sigue en uso por otra alerta o post
--   error    se agotaron los intentos automáticos; la referencia queda
--            para revisión. El cron no la vuelve a tomar.
-- ============================================================

CREATE TABLE IF NOT EXISTS adoption_image_deletions (
  id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  image_id TEXT NOT NULL,
  alert_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_adoption_image_deletions_due
  ON adoption_image_deletions (status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_adoption_image_deletions_image
  ON adoption_image_deletions (image_id, status);

-- Animaldex — Adopciones web: registro de límites para publicaciones sin cuenta
-- ============================================================
-- PREPARADA. NO ejecutar contra D1 remoto sin autorización.
-- Requiere 018_adoption_web_lifecycle.sql aplicada antes.
--
-- Registro independiente de los tokens de gestión: eliminar una publicación
-- no borra sus filas, así que no reinicia el contador de 24 h.
-- Guarda solo el hash de la IP. El cron borra filas de más de 48 h.
-- Solo crea una tabla nueva: no toca datos existentes.
-- ============================================================

CREATE TABLE IF NOT EXISTS adoption_guest_rate (
  id TEXT PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_adoption_guest_rate_ip ON adoption_guest_rate (ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_adoption_guest_rate_created ON adoption_guest_rate (created_at);

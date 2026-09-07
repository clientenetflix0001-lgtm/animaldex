-- Animaldex — última ubicación útil del usuario (señal interna de ranking)
-- ============================================================
-- LOCAL ONLY. NO ejecutar contra D1 remoto desde este cambio.
--
-- No es tracking continuo ni historial de posiciones.
-- Solo la última lat/lng/localidad útil para personalizar Inicio.
-- No se crea tabla de tracking.
-- ============================================================

ALTER TABLE users ADD COLUMN last_lat REAL;
ALTER TABLE users ADD COLUMN last_lng REAL;
ALTER TABLE users ADD COLUMN last_location_updated_at INTEGER;
ALTER TABLE users ADD COLUMN last_locality TEXT;

CREATE INDEX IF NOT EXISTS idx_users_last_locality ON users (last_locality);
CREATE INDEX IF NOT EXISTS idx_users_last_location_updated ON users (last_location_updated_at);

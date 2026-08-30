-- Overlays de texto en Reels (JSON). NO ejecutar contra D1 remoto
-- hasta autorización explícita. No altera posts/likes/comments/pets.
-- apply después de 001_reels.sql. REELS_SCHEMA_APPLY sigue apagado.

ALTER TABLE reels ADD COLUMN overlays_json TEXT;

-- Índices para grillas de perfil / mascota (NO ejecutar contra D1 remoto
-- hasta autorización explícita). No altera tablas ni Mux.
--
-- Consultas objetivo:
--   author_profile_id + status + deleted_at + created_at DESC
--   pet_id + status + deleted_at + created_at DESC
--
-- idx_reels_user (user_id, created_at) ya existe pero no cubre status.
-- idx_reels_feed (status, deleted_at, created_at) no filtra por owner/pet.
-- Sin estos índices, D1 puede escanear reels listos del feed global.

CREATE INDEX IF NOT EXISTS idx_reels_author_profile
  ON reels (author_profile_id, status, deleted_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reels_pet
  ON reels (pet_id, status, deleted_at, created_at DESC);

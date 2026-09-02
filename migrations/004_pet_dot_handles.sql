-- Animaldex — aliases de username de mascota
-- ============================================================
-- LOCAL ONLY. NO ejecutar contra D1 remoto desde este cambio.
--
-- Esta migración SOLO prepara schema de aliases.
-- Uso 1: migración inicial (nina → nina.pet).
-- Uso 2: tombstone de delete (nina.pet queda reservado para siempre).
-- El username de mascota es inmutable después de crear;
-- no se usan aliases para renombres futuros.
-- NO modifica pets.username.
-- NO crea el UNIQUE index (eso es 005, DESPUÉS del renombrado).
-- Schema suficiente: no hace falta columna extra ni migration 006.
--
-- Worker también puede crear esta tabla con CREATE IF NOT EXISTS
-- (ensurePetHandleAliasSchema). Correr 004 es idempotente.
--
-- Orden real (no ejecutar ahora):
--   1. inventario SELECT
--   2. esta tabla aliases (004 o Worker ensure)
--   3. transformar usernames (script JS, no este SQL)
--   4. INSERT aliases old → pet_id
--   5. validar 0 duplicados LOWER(username)
--   6. migrations/005_pet_dot_handles_unique.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS pet_username_aliases (
  old_username TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  new_username TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pet_username_aliases_pet ON pet_username_aliases (pet_id);

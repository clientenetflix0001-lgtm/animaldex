-- Animaldex — UNIQUE case-insensitive de pets.username
-- ============================================================
-- LOCAL ONLY. NO ejecutar hasta DESPUÉS del renombrado a *.pet.
--
-- Si se corre ANTES de resolver colisiones / NULL / duplicados,
-- CREATE UNIQUE INDEX falla o deja el namespace a medias.
--
-- D1/SQLite soporta índices por expresión (LOWER(username)).
-- Ya existe idx_pets_username UNIQUE sobre username (case-sensitive).
-- Este índice cubre variantes de mayúsculas.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_pets_username_lower ON pets (LOWER(username));

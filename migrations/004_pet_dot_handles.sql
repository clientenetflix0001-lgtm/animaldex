-- Animaldex — usernames de mascota terminados en .pet
-- ============================================================
-- LOCAL ONLY. NO ejecutar contra D1 remoto desde este cambio.
--
-- Consulta de inventario (no inventar cantidades sin acceso read-only):
--   SELECT id, username FROM pets ORDER BY id ASC;
--   SELECT COUNT(*) AS n FROM pets;
--   SELECT COUNT(*) AS n FROM pets WHERE LOWER(username) NOT LIKE '%.pet';
--
-- Algoritmo (ver lib/petHandleMigration.ts):
--   1. Reservar usernames que YA son válidos (*.pet).
--   2. Para el resto, en orden de pet.id:
--        nina      → nina.pet     (si libre)
--        nina      → nina2.pet    (si nina.pet ocupado)
--        nina.pet  → nina.pet     (no .pet.pet)
--   3. Guardar alias old_username → pet_id para /pet/nina y /nina.
--   4. UNIQUE case-insensitive sobre pets.username.
--
-- Rollback:
--   UPDATE pets SET username = a.old_username
--   FROM pet_username_aliases a WHERE a.pet_id = pets.id;
--   (pet.id no cambia.)
-- ============================================================

CREATE TABLE IF NOT EXISTS pet_username_aliases (
  old_username TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  new_username TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pet_username_aliases_pet ON pet_username_aliases (pet_id);

-- Índice único para carreras createPet/updatePet. SQLite/D1: expresión LOWER.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pets_username_lower ON pets (LOWER(username));

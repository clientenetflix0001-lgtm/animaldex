-- Animaldex — Adopciones web: especie confirmada en flyers
-- ============================================================
-- PREPARADA. NO ejecutar contra D1 remoto sin autorización.
--
-- species_confirmed INTEGER
--   NULL = nadie confirmó la especie.
--     Los flyers anteriores quedan así: su `species` puede ser 'otro'
--     de relleno y no deben entrar en Perros, Gatos ni Otros.
--   1 = quien publica eligió Perro, Gato u Otro.
--
-- No cambia el significado de `species`. No reescribe filas.
-- Las fotos y las alertas de la app no usan esta columna.
-- ============================================================

ALTER TABLE alerts ADD COLUMN species_confirmed INTEGER;

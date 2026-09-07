-- Animaldex — resolución y renovación de alertas
-- ============================================================
-- LOCAL ONLY. NO ejecutar contra D1 remoto desde este cambio.
--
-- status ya existe ('active'). Las columnas nuevas son nullable:
-- las alertas existentes siguen activas y cargan normalmente.
-- No se borra ningún row al resolver.
-- ============================================================

ALTER TABLE alerts ADD COLUMN resolved_at INTEGER;
ALTER TABLE alerts ADD COLUMN resolution_type TEXT;
ALTER TABLE alerts ADD COLUMN renewed_at INTEGER;
ALTER TABLE alerts ADD COLUMN sex TEXT;

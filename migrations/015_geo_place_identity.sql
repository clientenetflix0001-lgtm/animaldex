-- Animaldex — identidad territorial normalizada (GeoPlace)
-- ============================================================
-- LOCAL ONLY. NO ejecutar contra D1 remoto desde este cambio.
--
-- Migración ADITIVA. Guarda el lugar que eligió el usuario con la identidad
-- del catálogo oficial, sin tocar ni borrar los campos de texto que ya
-- existen (locality, province, location). Los consumidores actuales siguen
-- leyendo exactamente lo mismo que antes.
--
-- place_id     identidad cualificada: 'AR:georef:66028050'
--              formato countryCode:provider:providerPlaceId, para poder
--              sumar otros países o proveedores sin migrar de nuevo.
-- admin1_code  código oficial de nivel 1 (en Argentina, provincia INDEC).
-- admin2_code  código oficial de nivel 2 (en Argentina, departamento INDEC).
--              Es el nivel de anclaje: el gobierno local falta en el 32,8%
--              de las localidades, el departamento en ninguna.
--
-- Los códigos se guardan denormalizados a propósito: permiten filtrar por
-- provincia o departamento sin un JOIN y sin depender del texto.
--
-- El Worker detecta estas columnas con PRAGMA table_info y funciona igual
-- si todavía no existen, así que aplicar esto no es un requisito para
-- desplegar. Los seis filtros territoriales por texto NO cambian en esta
-- fase: estas columnas todavía no se leen.
-- ============================================================

ALTER TABLE alerts ADD COLUMN place_id TEXT;
ALTER TABLE alerts ADD COLUMN admin1_code TEXT;
ALTER TABLE alerts ADD COLUMN admin2_code TEXT;

ALTER TABLE listings ADD COLUMN place_id TEXT;
ALTER TABLE listings ADD COLUMN admin1_code TEXT;
ALTER TABLE listings ADD COLUMN admin2_code TEXT;

ALTER TABLE profiles ADD COLUMN place_id TEXT;
ALTER TABLE profiles ADD COLUMN admin1_code TEXT;
ALTER TABLE profiles ADD COLUMN admin2_code TEXT;

ALTER TABLE users ADD COLUMN place_id TEXT;
ALTER TABLE users ADD COLUMN admin1_code TEXT;
ALTER TABLE users ADD COLUMN admin2_code TEXT;

-- Índices por código, no por texto: son los que van a usar los filtros
-- territoriales cuando se migren en una fase posterior.
CREATE INDEX IF NOT EXISTS idx_alerts_place ON alerts (place_id);
CREATE INDEX IF NOT EXISTS idx_alerts_admin2 ON alerts (admin2_code);
CREATE INDEX IF NOT EXISTS idx_listings_place ON listings (place_id);
CREATE INDEX IF NOT EXISTS idx_listings_admin2 ON listings (admin2_code);
CREATE INDEX IF NOT EXISTS idx_profiles_place ON profiles (place_id);
CREATE INDEX IF NOT EXISTS idx_users_place ON users (place_id);

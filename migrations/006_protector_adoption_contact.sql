-- Animaldex — contacto de solicitudes de adopción (Páginas protector)
-- ============================================================
-- LOCAL ONLY. NO ejecutar contra D1 remoto desde este cambio.
--
-- Columnas nullable: las Páginas existentes siguen cargando.
-- No se toca pets. El contacto pertenece a profiles.
-- Worker también puede ALTER con CREATE/ADD IF via try/catch.
-- ============================================================

ALTER TABLE profiles ADD COLUMN adoption_whatsapp TEXT;
ALTER TABLE profiles ADD COLUMN adoption_phone TEXT;

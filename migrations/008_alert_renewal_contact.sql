-- Animaldex — contacto de adopción en alerta + aviso de renovación
-- ============================================================
-- LOCAL ONLY. NO ejecutar contra D1 remoto desde este cambio.
--
-- Columnas nullable: las alertas existentes siguen cargando.
-- contact_* solo se usa en alertas ADOPTION de usuario personal.
-- El feed / metadata NO deben exponer estos números.
-- ============================================================

ALTER TABLE alerts ADD COLUMN author_profile_id TEXT;
ALTER TABLE alerts ADD COLUMN contact_whatsapp TEXT;
ALTER TABLE alerts ADD COLUMN contact_phone TEXT;
ALTER TABLE alerts ADD COLUMN renewal_notified_at INTEGER;

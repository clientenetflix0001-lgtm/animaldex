-- LOCAL ONLY. No aplicar en D1 remoto todavía.
-- Contacto público del propietario (user/página) + raza normalizada + preferencia de match.

ALTER TABLE users ADD COLUMN contact_whatsapp TEXT;
ALTER TABLE users ADD COLUMN contact_phone TEXT;
ALTER TABLE users ADD COLUMN pet_contact_visible INTEGER NOT NULL DEFAULT 0;

ALTER TABLE profiles ADD COLUMN pet_contact_visible INTEGER NOT NULL DEFAULT 0;

ALTER TABLE alerts ADD COLUMN breed_id TEXT;

ALTER TABLE user_notification_prefs ADD COLUMN lost_breed_match INTEGER NOT NULL DEFAULT 1;

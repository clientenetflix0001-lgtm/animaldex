-- Animaldex — código público alfanumérico de chapitas QR
-- ============================================================
-- LOCAL ONLY. NO ejecutar contra D1 remoto desde este cambio.
--
-- `code` numérico interno se conserva (PK / chapitas viejas ?qr=17).
-- `public_code` es el identificador escrito a mano (AAA123) para URLs nuevas.
-- ============================================================

ALTER TABLE pet_tags ADD COLUMN public_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pet_tags_public_code ON pet_tags (public_code);

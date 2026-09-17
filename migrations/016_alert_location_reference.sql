-- Animaldex — referencia manual de alertas (barrio/calle/punto)
-- ============================================================
-- LOCAL ONLY. NO ejecutar contra D1 remoto desde este cambio.
--
-- Migración ADITIVA. location_reference es texto descriptivo. NO es
-- placeId, NO es municipio, NO entra a filtros, detección, reverse
-- geocode, Georef, mapas ni destinatarios push.
--
-- Vacíos → NULL. Sin backfill. Filas antiguas quedan NULL y siguen
-- funcionando.
-- ============================================================

ALTER TABLE alerts ADD COLUMN location_reference TEXT;

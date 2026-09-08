-- Additive / nullable. Do not run remotely in this task.
-- listings.renewed_at: bump de orden al renovar (mismo listing).
-- status 'sold' reutiliza la columna TEXT existente; no hay columna nueva.
ALTER TABLE listings ADD COLUMN renewed_at INTEGER;

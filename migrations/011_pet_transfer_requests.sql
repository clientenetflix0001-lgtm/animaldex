-- Animaldex — solicitudes de transferencia de titularidad
-- ============================================================
-- LOCAL ONLY. NO ejecutar contra D1 remoto desde este cambio.
--
-- Historial de adopciones completadas (Adoptados de Página) sigue en
-- pet_transfers (ensureProfilesSchema). Esta tabla cubre pending/accept/reject.
-- ============================================================

CREATE TABLE IF NOT EXISTS pet_transfer_requests (
  id TEXT PRIMARY KEY,
  pet_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL,
  source_profile_id TEXT,
  recipient_user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  responded_at INTEGER,
  completed_at INTEGER,
  cancelled_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ptr_recipient_status ON pet_transfer_requests (recipient_user_id, status);
CREATE INDEX IF NOT EXISTS idx_ptr_sender_status ON pet_transfer_requests (sender_user_id, status);
CREATE INDEX IF NOT EXISTS idx_ptr_pet_status ON pet_transfer_requests (pet_id, status);

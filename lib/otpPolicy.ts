/**
 * Política de OTP (rate limit / intentos / TTL).
 * El Worker replica estas constantes y reglas. Sin I/O.
 */

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_SEND_WINDOW_MS = 15 * 60 * 1000;
export const OTP_RESEND_GAP_MS = 30 * 1000;
export const OTP_MAX_SENDS = 3;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_TICKET_TTL_MS = 15 * 60 * 1000;

export type OtpPurpose = 'signup' | 'verify_phone';

export interface OtpChallengeState {
  sendCount: number;
  attemptCount: number;
  lastSentAt: number;
  expiresAt: number;
  verifiedAt: number | null;
  createdAt: number;
}

export function canSendOtp(row: OtpChallengeState | null, now: number): { ok: true } | { ok: false; error: string } {
  if (!row || row.verifiedAt) return { ok: true };
  if (now - row.lastSentAt < OTP_RESEND_GAP_MS) {
    return { ok: false, error: 'Esperá unos segundos antes de reenviar el código.' };
  }
  if (row.createdAt + OTP_SEND_WINDOW_MS > now && row.sendCount >= OTP_MAX_SENDS) {
    return { ok: false, error: 'Demasiados envíos. Probá de nuevo más tarde.' };
  }
  return { ok: true };
}

export function canAttemptOtp(row: OtpChallengeState | null, now: number): { ok: true } | { ok: false; error: string } {
  if (!row) return { ok: false, error: 'Solicitá un código primero.' };
  if (row.verifiedAt) return { ok: false, error: 'Ese código ya fue usado.' };
  if (now > row.expiresAt) return { ok: false, error: 'El código expiró, solicitá uno nuevo.' };
  if (row.attemptCount >= OTP_MAX_ATTEMPTS) {
    return { ok: false, error: 'Demasiados intentos. Solicitá un código nuevo.' };
  }
  return { ok: true };
}

export function nextSendState(row: OtpChallengeState | null, now: number): OtpChallengeState {
  const windowExpired = row ? now - row.createdAt >= OTP_SEND_WINDOW_MS : true;
  if (!row || windowExpired || row.verifiedAt) {
    return {
      sendCount: 1,
      attemptCount: 0,
      lastSentAt: now,
      expiresAt: now + OTP_TTL_MS,
      verifiedAt: null,
      createdAt: now,
    };
  }
  return {
    ...row,
    sendCount: row.sendCount + 1,
    lastSentAt: now,
    expiresAt: now + OTP_TTL_MS,
    attemptCount: 0,
  };
}

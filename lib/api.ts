// Cliente para las funciones serverless (/sms y /upload).
// El OTP vive en el Worker (otp_challenges + ticket). Sin fallback local
// ni demoCode: no se revelan códigos en el cliente.

import { API_ORIGIN } from './db';
import type { OtpPurpose } from './otpPolicy';

export interface SendCodeResult {
  ok: boolean;
  retryAfter?: number;
  expiresIn?: number;
  error?: string;
}

export interface VerifyResult {
  ok: boolean;
  verified?: boolean;
  phone?: string;
  ticket?: string;
  exp?: number;
  error?: string;
}

export interface UploadResult {
  ok: boolean;
  provider: 'cloudflare' | 'demo' | 'local';
  url: string;
  message?: string;
  error?: string;
}

async function post(path: string, body: object): Promise<any> {
  const res = await fetch(`${API_ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
}

export async function sendVerificationCode(
  phone: string,
  purpose: OtpPurpose = 'signup'
): Promise<SendCodeResult> {
  return await post('/sms', { action: 'send', phone, purpose });
}

export async function verifyCode(
  phone: string,
  code: string,
  purpose: OtpPurpose = 'signup'
): Promise<VerifyResult> {
  return await post('/sms', { action: 'verify', phone, code, purpose });
}

export async function uploadImage(dataUrl: string): Promise<UploadResult> {
  try {
    return await post('/upload', { image: dataUrl });
  } catch (e: any) {
    if (e?.message && !/Failed to fetch|Network|JSON/i.test(e.message)) throw e;
    return { ok: true, provider: 'local', url: dataUrl };
  }
}

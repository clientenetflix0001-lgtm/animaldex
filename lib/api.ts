// Cliente para las funciones serverless (/api/sms y /api/upload).
// Si la API no está disponible (ej. vista previa nativa sin backend),
// se activa un modo demo local para que la app siga funcionando.

import { API_ORIGIN } from './db';

export interface SendCodeResult {
  ok: boolean;
  provider: 'twilio' | 'demo' | 'local';
  token: string;
  exp: number;
  demoCode?: string;
  message?: string;
  error?: string;
}

export interface VerifyResult {
  ok: boolean;
  verified?: boolean;
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

// ---------- SMS (Twilio) ----------

let localCode: { phone: string; code: string; exp: number } | null = null;

export async function sendVerificationCode(phone: string): Promise<SendCodeResult> {
  try {
    return await post('/sms', { action: 'send', phone });
  } catch (e: any) {
    if (e?.message && !/Failed to fetch|Network|JSON/i.test(e.message)) throw e;
    // Fallback local (sin backend): genera el código en el dispositivo
    const code = String(Math.floor(100000 + Math.random() * 900000));
    localCode = { phone, code, exp: Date.now() + 10 * 60 * 1000 };
    return {
      ok: true,
      provider: 'local',
      token: 'local',
      exp: localCode.exp,
      demoCode: code,
      message: 'Modo demo local: el código se muestra en pantalla.',
    };
  }
}

export async function verifyCode(
  phone: string,
  code: string,
  token: string,
  exp: number
): Promise<VerifyResult> {
  if (token === 'local') {
    if (!localCode || localCode.phone !== phone) return { ok: false, error: 'Solicita un código primero' };
    if (Date.now() > localCode.exp) return { ok: false, error: 'El código expiró, solicita uno nuevo' };
    if (localCode.code !== code) return { ok: false, error: 'Código incorrecto' };
    return { ok: true, verified: true };
  }
  try {
    return await post('/sms', { action: 'verify', phone, code, token, exp });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Error de verificación' };
  }
}

// ---------- Imágenes (Cloudflare Images) ----------

export async function uploadImage(dataUrl: string): Promise<UploadResult> {
  try {
    return await post('/upload', { image: dataUrl });
  } catch (e: any) {
    if (e?.message && !/Failed to fetch|Network|JSON/i.test(e.message)) throw e;
    // Fallback local: usa la imagen tal cual
    return { ok: true, provider: 'local', url: dataUrl };
  }
}

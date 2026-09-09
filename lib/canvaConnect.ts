import Constants from 'expo-constants';
import type { AlertType } from './alerts.ts';
import type { AlertFlyer } from './alertFlyer.ts';

/**
 * Integración oficial: Canva Connect Autofill API.
 * Docs: https://www.canva.dev/docs/connect/api-reference/autofills/
 *
 * POST https://api.canva.com/rest/v1/autofills
 * GET  https://api.canva.com/rest/v1/autofills/{jobId}
 *
 * Requisitos que NO están en este repo (no commitear secretos):
 * - Canva Connect Client ID / Client Secret
 * - OAuth de usuario (access token que actúe en nombre de un miembro
 *   de una organización Canva Enterprise)
 * - Brand templates autofillables (Canva Data autofill app) con IDs
 * - Upload de fotos vía Assets API si el campo de imagen lo exige
 *
 * Sin eso, Autofill no se llama. "Editar en Canva" abre el sitio público.
 */

const AUTOFILL_URL = 'https://api.canva.com/rest/v1/autofills';
const CANVA_TEMPLATES = 'https://www.canva.com/templates/';

export type CanvaAutofillStatus = 'not_configured' | 'missing_token' | 'missing_templates' | 'ready';

type TemplateMap = Partial<Record<AlertType, string>>;

function extra(): Record<string, any> {
  return (Constants.expoConfig?.extra || {}) as Record<string, any>;
}

function readToken(): string {
  const fromExtra = String(extra().canvaAccessToken || '').trim();
  const fromEnv = String(process.env.EXPO_PUBLIC_CANVA_ACCESS_TOKEN || '').trim();
  return fromExtra || fromEnv;
}

function readTemplates(): TemplateMap {
  const raw = extra().canvaBrandTemplateIds || {};
  const envLost = String(process.env.EXPO_PUBLIC_CANVA_TEMPLATE_LOST || '').trim();
  return {
    lost: present(raw.lost) || envLost || undefined,
    sighting: present(raw.sighting),
    found: present(raw.found),
    adoption: present(raw.adoption),
  };
}

function present(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text || undefined;
}

export function canvaAutofillStatus(): CanvaAutofillStatus {
  const token = readToken();
  const templates = readTemplates();
  const anyTemplate = Object.values(templates).some(Boolean);
  if (!token && !anyTemplate) return 'not_configured';
  if (!token) return 'missing_token';
  if (!anyTemplate) return 'missing_templates';
  return 'ready';
}

export function canvaTemplateSearchUrl(type: AlertType): string {
  const q =
    type === 'lost'
      ? 'mascota perdida'
      : type === 'adoption'
        ? 'adopcion mascota'
        : type === 'found'
          ? 'mascota encontrada'
          : 'mascota avistada';
  return `${CANVA_TEMPLATES}?query=${encodeURIComponent(q)}`;
}

export function flyerToCanvaAutofillData(flyer: AlertFlyer): Record<string, { type: 'text'; text: string } | { type: 'image'; asset_id: string }> {
  const data: Record<string, { type: 'text'; text: string }> = {};
  const put = (key: string, value?: string) => {
    if (value) data[key] = { type: 'text', text: value };
  };
  put('headline', flyer.headline);
  put('pet_name', flyer.petName);
  put('species', flyer.speciesLabel);
  put('sex', flyer.sexLabel);
  put('breed', flyer.breed);
  put('location', flyer.location);
  put('date', flyer.dateLabel);
  put('description', flyer.description);
  put('contact', flyer.contact);
  put('cta', flyer.cta);
  put('brand', 'Animaldex');
  return data;
}

export async function createCanvaAutofillJob(
  flyer: AlertFlyer
): Promise<{ ok: true; editUrl: string; viewUrl?: string } | { ok: false; error: string }> {
  const status = canvaAutofillStatus();
  if (status !== 'ready') {
    return {
      ok: false,
      error:
        status === 'missing_token'
          ? 'Falta el access token OAuth de Canva Connect (no commitear secretos).'
          : status === 'missing_templates'
            ? 'Faltan brand template IDs de Canva (extra.canvaBrandTemplateIds).'
            : 'Canva Autofill no está configurado.',
    };
  }
  const templateId = readTemplates()[flyer.type] || readTemplates().lost;
  if (!templateId) {
    return { ok: false, error: 'No hay plantilla Canva para este tipo de alerta.' };
  }
  try {
    const res = await fetch(AUTOFILL_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${readToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'create_from_brand_template',
        brand_template_id: templateId,
        title: flyer.petName ? `${flyer.headline} · ${flyer.petName}` : flyer.headline,
        data: flyerToCanvaAutofillData(flyer),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: body?.error?.message || `Canva respondió ${res.status}` };
    }
    const jobId = body?.job?.id;
    if (!jobId) return { ok: false, error: 'Canva no devolvió un job de Autofill.' };
    const done = await pollAutofillJob(jobId);
    return done;
  } catch {
    return { ok: false, error: 'No se pudo contactar la API de Canva.' };
  }
}

async function pollAutofillJob(
  jobId: string
): Promise<{ ok: true; editUrl: string; viewUrl?: string } | { ok: false; error: string }> {
  for (let i = 0; i < 8; i++) {
    const res = await fetch(`${AUTOFILL_URL}/${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${readToken()}` },
    });
    const body = await res.json().catch(() => ({}));
    const job = body?.job;
    if (job?.status === 'success') {
      const editUrl = job.result?.design?.urls?.edit_url || job.result?.design?.url;
      if (!editUrl) return { ok: false, error: 'Canva creó el diseño pero no envió URL de edición.' };
      return { ok: true, editUrl, viewUrl: job.result?.design?.urls?.view_url };
    }
    if (job?.status === 'failed') {
      return { ok: false, error: job.error?.message || 'Canva no pudo completar el Autofill.' };
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return { ok: false, error: 'Canva tardó demasiado en generar el diseño.' };
}

export function canvaSetupHint(status: CanvaAutofillStatus = canvaAutofillStatus()): string {
  if (status === 'ready') return '';
  if (status === 'missing_token') {
    return 'Autofill listo en código, pero falta el token OAuth de Canva Connect.';
  }
  if (status === 'missing_templates') {
    return 'Faltan IDs de brand templates autofillables en extra.canvaBrandTemplateIds.';
  }
  return 'Para Autofill automático hace falta una app Canva Connect (Client ID/Secret), OAuth Enterprise y plantillas.';
}

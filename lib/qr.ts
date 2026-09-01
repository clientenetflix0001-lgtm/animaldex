// ============================================================
// Animaldex — Resolución de contenido escaneado por QR
// ============================================================
// Analiza el texto/URL leído por el escáner y decide qué representa:
// un perfil de mascota, de usuario, una publicación, un enlace externo
// o simplemente texto plano. La navegación real dentro de la app se
// resuelve en QRScannerScreen usando este resultado.
//
// Nota: se evita `new URL()` (no siempre disponible/estable en Hermes
// para RN) y en su lugar se usan expresiones regulares livianas.

import { isReservedPublicUsername, USERNAME_RE } from './publicHandles';
import { hasPetSuffix } from './petHandles';

export type ScanResolution =
  | { kind: 'pet'; id: string; raw: string }
  | { kind: 'user'; id: string; raw: string }
  | { kind: 'handle'; username: string; raw: string }
  | { kind: 'post'; id: string; raw: string }
  | { kind: 'tag'; code: number; raw: string }
  | { kind: 'url'; url: string; raw: string }
  | { kind: 'text'; raw: string };

const HTTP_URL_RE = /^https?:\/\/[^\s]+$/i;
const SCHEME_RE = /^animaldex:\/\/(.+)$/i;
const PATH_AFTER_HOST_RE = /^https?:\/\/[^/?#]+(\/[^?#]*)?/i;

function matchKnownPath(path: string): { kind: 'pet' | 'user' | 'handle' | 'post'; id?: string; username?: string } | null {
  const clean = path.replace(/^\/+/, '').replace(/\/+$/, '');
  let m = clean.match(/^pet\/([^/?#]+)/i);
  if (m) return { kind: 'pet', id: decodeURIComponent(m[1]) };
  m = clean.match(/^user\/([^/?#]+)/i);
  if (m) return { kind: 'user', id: decodeURIComponent(m[1]) };
  m = clean.match(/^p\/([^/?#]+)/i);
  if (m) return { kind: 'post', id: decodeURIComponent(m[1]) };
  if (hasPetSuffix(clean) && USERNAME_RE.test(clean)) {
    return { kind: 'pet', id: decodeURIComponent(clean.toLowerCase()) };
  }
  if (USERNAME_RE.test(clean) && !isReservedPublicUsername(clean)) {
    return { kind: 'handle', username: clean.toLowerCase() };
  }
  return null;
}

export function resolveScannedValue(rawValue: string): ScanResolution {
  const value = (rawValue || '').trim();

  // 0) Chapita QR de mascota: cualquier URL con ?qr=<código numérico>,
  //    sin importar el dominio (funciona con el dominio final del usuario
  //    o con el de preview mientras tanto).
  const tagMatch = value.match(/[?&]qr=(\d+)/);
  if (tagMatch) {
    const code = Number(tagMatch[1]);
    if (Number.isInteger(code)) return { kind: 'tag', code, raw: value };
  }

  // 1) Deep link con esquema propio de la app: animaldex://pet/xxx
  const schemeMatch = value.match(SCHEME_RE);
  if (schemeMatch) {
    const parsed = matchKnownPath(schemeMatch[1]);
    if (parsed?.kind === 'handle' && parsed.username) return { kind: 'handle', username: parsed.username, raw: value };
    if (parsed?.id) return { kind: parsed.kind as 'pet' | 'user' | 'post', id: parsed.id, raw: value };
  }

  // 2) URL http(s): si el path coincide con una ruta conocida de Animaldex,
  //    se resuelve como navegación interna; si no, como enlace externo.
  if (HTTP_URL_RE.test(value)) {
    const pathMatch = value.match(PATH_AFTER_HOST_RE);
    const pathname = pathMatch ? pathMatch[1] || '' : '';
    const parsed = pathname ? matchKnownPath(pathname) : null;
    if (parsed?.kind === 'handle' && parsed.username) return { kind: 'handle', username: parsed.username, raw: value };
    if (parsed?.id) return { kind: parsed.kind as 'pet' | 'user' | 'post', id: parsed.id, raw: value };
    return { kind: 'url', url: value, raw: value };
  }

  // 3) Cualquier otro contenido: texto plano.
  return { kind: 'text', raw: value };
}

export function scanKindLabel(kind: ScanResolution['kind']): string {
  switch (kind) {
    case 'pet':
      return 'Perfil de mascota';
    case 'user':
      return 'Perfil de usuario';
    case 'handle':
      return 'Perfil público';
    case 'post':
      return 'Publicación';
    case 'tag':
      return 'Chapita QR de mascota';
    case 'url':
      return 'Enlace';
    default:
      return 'Código QR';
  }
}

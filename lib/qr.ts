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

export type ScanResolution =
  | { kind: 'pet'; id: string; raw: string }
  | { kind: 'user'; id: string; raw: string }
  | { kind: 'post'; id: string; raw: string }
  | { kind: 'url'; url: string; raw: string }
  | { kind: 'text'; raw: string };

const HTTP_URL_RE = /^https?:\/\/[^\s]+$/i;
const SCHEME_RE = /^animaldex:\/\/(.+)$/i;
const PATH_AFTER_HOST_RE = /^https?:\/\/[^/?#]+(\/[^?#]*)?/i;

function matchKnownPath(path: string): { kind: 'pet' | 'user' | 'post'; id: string } | null {
  const clean = path.replace(/^\/+/, '').replace(/\/+$/, '');
  let m = clean.match(/^pet\/([^/?#]+)/i);
  if (m) return { kind: 'pet', id: decodeURIComponent(m[1]) };
  m = clean.match(/^user\/([^/?#]+)/i);
  if (m) return { kind: 'user', id: decodeURIComponent(m[1]) };
  m = clean.match(/^p\/([^/?#]+)/i);
  if (m) return { kind: 'post', id: decodeURIComponent(m[1]) };
  return null;
}

export function resolveScannedValue(rawValue: string): ScanResolution {
  const value = (rawValue || '').trim();

  // 1) Deep link con esquema propio de la app: animaldex://pet/xxx
  const schemeMatch = value.match(SCHEME_RE);
  if (schemeMatch) {
    const parsed = matchKnownPath(schemeMatch[1]);
    if (parsed) return { ...parsed, raw: value };
  }

  // 2) URL http(s): si el path coincide con una ruta conocida de Animaldex,
  //    se resuelve como navegación interna; si no, como enlace externo.
  if (HTTP_URL_RE.test(value)) {
    const pathMatch = value.match(PATH_AFTER_HOST_RE);
    const pathname = pathMatch ? pathMatch[1] || '' : '';
    const parsed = pathname ? matchKnownPath(pathname) : null;
    if (parsed) return { ...parsed, raw: value };
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
    case 'post':
      return 'Publicación';
    case 'url':
      return 'Enlace';
    default:
      return 'Código QR';
  }
}

// ============================================================
// Animaldex — validación centralizada de imágenes subidas.
// ============================================================
// Todas las imágenes de la app (mascotas, avatares, posts, alertas, mercado,
// historias, páginas) pasan por `uploadImage()` en el cliente y llegan a un
// único endpoint: POST /upload. Este módulo es la puerta de ese endpoint.
//
// Lo que se validaba antes era el `data:` URL que mandaba el cliente:
//
//   /^data:(image\/[a-z+]+);base64,(.+)$/
//
// Eso acepta cualquier subtipo que el cliente quiera declarar, incluido
// `image/svg+xml`, y no mira ni un byte del contenido. Un archivo HTML con
// `<script>` anunciado como `image/png` pasaba el filtro entero.
//
// Tres reglas gobiernan este módulo:
//
//   1. EL CLIENTE NO DECIDE EL TIPO. El formato sale de los magic bytes del
//      contenido. Lo que el cliente declara sólo sirve para detectar
//      incongruencias y rechazarlas.
//
//   2. LISTA BLANCA, NO LISTA NEGRA. Sólo pasan los formatos que Animaldex
//      realmente produce y que Cloudflare Images acepta. Todo lo demás se
//      rechaza aunque parezca inofensivo.
//
//   3. EL TAMAÑO SE CORTA ANTES DE DECODIFICAR. El límite se aplica sobre la
//      longitud del base64, así no se materializa en memoria un buffer grande
//      para después descartarlo.
//
// Qué aporta Cloudflare Images (y qué NO):
//   Sí  · rechaza lo que no puede decodificar como imagen;
//         limita a 10 MB, 12.000 px de lado y 100 megapíxeles;
//         sanitiza SVG con svg-hush al SERVIRLO (quita scripts, hipervínculos
//         y referencias cross-origin).
//   No  · no impide que un SVG entre al sistema, y la sanitización es una
//         mitigación en la entrega, no en el almacenamiento. Animaldex nunca
//         necesita SVG: todas las imágenes vienen del selector de fotos.
//   No  · no valida NADA antes de que la petición llegue a Cloudflare, así que
//         sin control propio cualquiera podría gastar la cuota de la cuenta.
//   No  · no soporta HEIC, así que conviene rechazarlo con un mensaje claro en
//         vez de dejar que falle más adelante con un error opaco.
// ============================================================

/** Tope de bytes ya decodificados. Queda por debajo de los 10 MB de Cloudflare. */
export const MAX_IMAGE_BYTES = 8_000_000;

/** Longitud máxima del base64 que representa ese tamaño (4 chars = 3 bytes). */
export const MAX_BASE64_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;

/** El mensaje sale del constante para que no puedan desincronizarse. */
const TOO_LARGE = `Imagen demasiado grande (máx ${Math.round(MAX_IMAGE_BYTES / 1_000_000)} MB)`;

/**
 * Formatos aceptados: los que produce el selector de fotos del teléfono y que
 * Cloudflare Images admite. SVG queda deliberadamente afuera.
 */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Extensiones usadas para nombrar el archivo enviado a Cloudflare. */
export const IMAGE_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

/** Sinónimos que algunos selectores devuelven para un mismo formato. */
const MIME_ALIASES = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
};

export function canonicalMime(raw) {
  const mime = String(raw || '').trim().toLowerCase().split(';')[0];
  return MIME_ALIASES[mime] || mime;
}

// ------------------------------------------------------------
// Reconocimiento por contenido
// ------------------------------------------------------------

function startsWith(bytes, signature, offset = 0) {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

function ascii(bytes, offset, length) {
  let out = '';
  for (let i = offset; i < offset + length && i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1'];

/**
 * Formatos peligrosos o simplemente no esperados. Se nombran uno por uno para
 * poder explicar el rechazo, en vez de responder un genérico "no es imagen".
 */
function sniffRejected(bytes) {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return 'PDF';
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return 'ZIP/APK';
  if (startsWith(bytes, [0x50, 0x4b, 0x05, 0x06])) return 'ZIP/APK';
  if (startsWith(bytes, [0x7f, 0x45, 0x4c, 0x46])) return 'ejecutable ELF';
  if (startsWith(bytes, [0x4d, 0x5a])) return 'ejecutable de Windows';
  if (startsWith(bytes, [0xca, 0xfe, 0xba, 0xbe])) return 'ejecutable Mach-O/Java';
  if (startsWith(bytes, [0xfe, 0xed, 0xfa, 0xce])) return 'ejecutable Mach-O';
  if (startsWith(bytes, [0xcf, 0xfa, 0xed, 0xfe])) return 'ejecutable Mach-O';
  if (startsWith(bytes, [0x1f, 0x8b])) return 'archivo comprimido gzip';
  if (startsWith(bytes, [0x42, 0x5a, 0x68])) return 'archivo comprimido bzip2';
  if (ascii(bytes, 4, 4) === 'ftyp' && HEIF_BRANDS.includes(ascii(bytes, 8, 4).toLowerCase())) {
    return 'HEIC';
  }

  // Texto: SVG, HTML y scripts. Se saltea BOM y espacios porque
  // "   <svg" y "\uFEFF<svg" son igual de ejecutables que "<svg".
  let i = 0;
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) i = 3;
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) i += 1;
  const head = ascii(bytes, i, 512).toLowerCase();
  if (head.startsWith('<svg') || head.includes('<svg ') || head.includes('<svg>')) return 'SVG';
  if (head.startsWith('<?xml')) return head.includes('<svg') ? 'SVG' : 'XML';
  if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'HTML';
  if (head.startsWith('<script') || head.startsWith('<!--')) return 'HTML/script';
  if (head.startsWith('#!')) return 'script ejecutable';
  return null;
}

/**
 * Devuelve el MIME real según los magic bytes, o null si no es una imagen de
 * los formatos aceptados.
 */
export function sniffImageMime(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a') return 'image/gif';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  return null;
}

// ------------------------------------------------------------
// Entrada: el data URL
// ------------------------------------------------------------

const DATA_URL_RE = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i;

function decodeBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Valida una imagen recibida como data URL.
 *
 * Devuelve `{ ok: true, mime, ext, bytes, declaredMime }` o
 * `{ ok: false, error, status }` con un mensaje mostrable al usuario.
 */
export function validateImageUpload(raw) {
  const image = typeof raw === 'string' ? raw : '';
  if (!image) return { ok: false, status: 400, error: 'Falta la imagen' };

  const m = image.match(DATA_URL_RE);
  if (!m) return { ok: false, status: 400, error: 'Imagen inválida (se espera data URL base64)' };

  const declaredMime = canonicalMime(m[1]);
  const base64 = m[2].replace(/\s+/g, '');

  // El corte por tamaño va antes de decodificar.
  if (base64.length > MAX_BASE64_LENGTH) {
    return { ok: false, status: 413, error: TOO_LARGE };
  }

  let bytes;
  try {
    bytes = decodeBase64(base64);
  } catch (_) {
    return { ok: false, status: 400, error: 'Imagen inválida (base64 corrupto)' };
  }
  if (bytes.length === 0) {
    return { ok: false, status: 400, error: 'Imagen inválida (contenido vacío)' };
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    return { ok: false, status: 413, error: TOO_LARGE };
  }

  // Lo que el cliente declara ni siquiera se considera si el contenido es otra
  // cosa: primero se mira el archivo.
  const rejected = sniffRejected(bytes);
  if (rejected) {
    return { ok: false, status: 415, error: `Ese archivo es ${rejected}, no una imagen. Subí una foto JPG, PNG, WebP o GIF.` };
  }

  const mime = sniffImageMime(bytes);
  if (!mime) {
    return { ok: false, status: 415, error: 'El archivo no es una imagen válida. Subí una foto JPG, PNG, WebP o GIF.' };
  }
  if (!ALLOWED_IMAGE_TYPES.includes(mime)) {
    return { ok: false, status: 415, error: 'Formato de imagen no admitido. Usá JPG, PNG, WebP o GIF.' };
  }

  // Incongruencia entre lo declarado y lo real: se rechaza en vez de
  // "corregir" en silencio, porque un cliente honesto no se equivoca acá.
  if (declaredMime && declaredMime !== mime) {
    return {
      ok: false,
      status: 415,
      error: 'El tipo declarado no coincide con el contenido del archivo.',
    };
  }

  return { ok: true, mime, ext: IMAGE_EXTENSIONS[mime], bytes, declaredMime };
}

/**
 * Nombre del archivo que se manda a Cloudflare. Lo genera el servidor: nunca
 * se usa un nombre ni una ruta que haya elegido el usuario.
 */
export function storageFilename(ext, now = Date.now(), random = Math.random) {
  const suffix = Math.floor(random() * 1e9).toString(36);
  return `animaldex-${now}-${suffix}.${ext}`;
}

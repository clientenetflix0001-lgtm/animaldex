// ============================================================
// Hardening previo al AAB + adaptive icon.
// ============================================================
// Cubre lo que se tocó y lo que se auditó y se decidió NO tocar, para que una
// regresión futura tenga que romper un test en vez de pasar desapercibida.
//
// El grueso son las subidas de imagen: son el único punto donde un archivo
// arbitrario entra al sistema. Los bloques de URLs, autorización y SQL fijan
// invariantes que hoy ya se cumplen.
// ============================================================

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALLOWED_IMAGE_TYPES,
  MAX_BASE64_LENGTH,
  MAX_IMAGE_BYTES,
  canonicalMime,
  sniffImageMime,
  storageFilename,
  validateImageUpload,
} from '../worker/imageUpload.js';
import { resolveScannedValue } from '../lib/qr.ts';
import { buildTelUrl, buildWhatsAppUrl } from '../lib/adoptionContact.ts';
import { resolveListingContactAction } from '../lib/listingContact.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/** Quita comentarios: un test no debe pasar por lo que dice una nota. */
function code(source: string): string {
  return source
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n');
}

const workerIndex = read('worker/index.js');
const workerCode = code(workerIndex);

// ------------------------------------------------------------
// Utilidades para armar archivos de prueba
// ------------------------------------------------------------

function dataUrl(mime: string, bytes: number[] | Uint8Array): string {
  return `data:${mime};base64,${Buffer.from(Uint8Array.from(bytes)).toString('base64')}`;
}

function textDataUrl(mime: string, text: string): string {
  return `data:${mime};base64,${Buffer.from(text, 'utf8').toString('base64')}`;
}

/** Cabeceras reales; el validador mira magic bytes, no decodifica la imagen. */
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x00, 0x00];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52];
const GIF = [...Buffer.from('GIF89a'), 0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00, 0xff];
const WEBP = [...Buffer.from('RIFF'), 0x1a, 0x00, 0x00, 0x00, ...Buffer.from('WEBPVP8 '), 0x00, 0x00];
const HEIC = [0x00, 0x00, 0x00, 0x18, ...Buffer.from('ftyp'), ...Buffer.from('heic'), 0x00, 0x00, 0x00, 0x00];

describe('subidas de imagen · lo que se acepta', () => {
  it('acepta los cuatro formatos que la app produce', () => {
    for (const [mime, bytes] of [
      ['image/jpeg', JPEG],
      ['image/png', PNG],
      ['image/gif', GIF],
      ['image/webp', WEBP],
    ] as const) {
      const res = validateImageUpload(dataUrl(mime, bytes));
      assert.equal(res.ok, true, `${mime} debería aceptarse: ${(res as any).error}`);
      assert.equal(res.mime, mime);
    }
  });

  it('acepta un PNG real del repositorio', () => {
    const png = readFileSync(join(root, 'assets/android-icon-foreground.png'));
    const res = validateImageUpload(`data:image/png;base64,${png.toString('base64')}`);
    assert.equal(res.ok, true);
    assert.equal(res.mime, 'image/png');
    assert.equal(res.ext, 'png');
  });

  it('normaliza los sinónimos que devuelven algunos selectores de fotos', () => {
    assert.equal(canonicalMime('IMAGE/JPG'), 'image/jpeg');
    assert.equal(canonicalMime('image/jpeg; charset=binary'), 'image/jpeg');
    // image/jpg no debe tratarse como incongruencia contra un JPEG real.
    assert.equal(validateImageUpload(dataUrl('image/jpg', JPEG)).ok, true);
  });

  it('la lista blanca no incluye SVG', () => {
    assert.deepEqual(ALLOWED_IMAGE_TYPES, ['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
    assert.ok(!ALLOWED_IMAGE_TYPES.includes('image/svg+xml' as never));
  });
});

describe('subidas de imagen · archivos disfrazados', () => {
  it('rechaza HTML anunciado como PNG', () => {
    const res = validateImageUpload(textDataUrl('image/png', '<!doctype html><html><body>hola</body></html>'));
    assert.equal(res.ok, false);
    assert.equal((res as any).status, 415);
    assert.match((res as any).error, /HTML/);
  });

  it('rechaza un script anunciado como imagen', () => {
    const res = validateImageUpload(textDataUrl('image/jpeg', '<script>fetch("https://evil.example")</script>'));
    assert.equal(res.ok, false);
    assert.match((res as any).error, /HTML|script/i);
  });

  it('rechaza SVG, que es el formato ejecutable que más se cuela como imagen', () => {
    for (const svg of [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      '   <svg width="10" height="10"></svg>',
      '\uFEFF<svg></svg>',
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>',
    ]) {
      const res = validateImageUpload(textDataUrl('image/svg+xml', svg));
      assert.equal(res.ok, false, `debería rechazar: ${svg.slice(0, 30)}`);
      assert.match((res as any).error, /SVG/);
    }
  });

  it('rechaza SVG aunque se declare como PNG', () => {
    const res = validateImageUpload(textDataUrl('image/png', '<svg xmlns="http://www.w3.org/2000/svg"/>'));
    assert.equal(res.ok, false);
    assert.match((res as any).error, /SVG/);
  });

  it('rechaza ejecutables y contenedores', () => {
    const casos: Array<[string, number[], RegExp]> = [
      ['PDF', [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0, 0, 0, 0], /PDF/],
      ['APK/ZIP', [0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0], /ZIP|APK/],
      ['ELF', [0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0, 0, 0, 0, 0], /ELF/],
      ['EXE', [0x4d, 0x5a, 0x90, 0x00, 3, 0, 0, 0, 4, 0, 0, 0], /Windows/],
      ['gzip', [0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0, 0, 0, 0, 0], /gzip/],
    ];
    for (const [nombre, bytes, patron] of casos) {
      const res = validateImageUpload(dataUrl('image/png', bytes));
      assert.equal(res.ok, false, `${nombre} debería rechazarse`);
      assert.equal((res as any).status, 415);
      assert.match((res as any).error, patron);
    }
  });

  it('rechaza HEIC con un mensaje claro, porque Cloudflare Images no lo soporta', () => {
    const res = validateImageUpload(dataUrl('image/heic', HEIC));
    assert.equal(res.ok, false);
    assert.match((res as any).error, /HEIC/);
  });

  it('rechaza bytes arbitrarios que no son ninguna imagen conocida', () => {
    const res = validateImageUpload(dataUrl('image/png', Array.from({ length: 64 }, (_, i) => (i * 7) % 251)));
    assert.equal(res.ok, false);
    assert.equal((res as any).status, 415);
  });
});

describe('subidas de imagen · MIME incongruente', () => {
  it('rechaza un PNG real declarado como JPEG', () => {
    const res = validateImageUpload(dataUrl('image/jpeg', PNG));
    assert.equal(res.ok, false);
    assert.match((res as any).error, /no coincide/i);
  });

  it('rechaza un JPEG real declarado como WebP', () => {
    const res = validateImageUpload(dataUrl('image/webp', JPEG));
    assert.equal(res.ok, false);
    assert.match((res as any).error, /no coincide/i);
  });

  it('el tipo devuelto sale del contenido, no de lo declarado', () => {
    assert.equal(sniffImageMime(Uint8Array.from(PNG)), 'image/png');
    assert.equal(sniffImageMime(Uint8Array.from(JPEG)), 'image/jpeg');
    assert.equal(sniffImageMime(Uint8Array.from(WEBP)), 'image/webp');
    assert.equal(sniffImageMime(Uint8Array.from(GIF)), 'image/gif');
    assert.equal(sniffImageMime(Uint8Array.from(HEIC)), null);
  });
});

describe('subidas de imagen · tamaño', () => {
  it('rechaza por encima del máximo', () => {
    const grande = 'A'.repeat(MAX_BASE64_LENGTH + 4);
    const res = validateImageUpload(`data:image/png;base64,${grande}`);
    assert.equal(res.ok, false);
    assert.equal((res as any).status, 413);
    assert.match((res as any).error, /grande/i);
  });

  it('corta por longitud del base64 ANTES de decodificar', () => {
    // Longitud ≡ 1 (mod 4): atob la rechaza. Si el módulo decodificara primero
    // el error sería "base64 corrupto"; que responda 413 prueba que el corte
    // por tamaño ocurrió antes de materializar los bytes en memoria.
    assert.equal((MAX_BASE64_LENGTH + 1) % 4, 1);
    const res = validateImageUpload(`data:image/png;base64,${'A'.repeat(MAX_BASE64_LENGTH + 1)}`);
    assert.equal((res as any).status, 413);
    assert.match((res as any).error, /grande/i);
  });

  it('el máximo es 8 MB y queda por debajo del tope de Cloudflare Images', () => {
    assert.equal(MAX_IMAGE_BYTES, 8_000_000);
    assert.ok(MAX_IMAGE_BYTES < 10_000_000);
    assert.equal(MAX_BASE64_LENGTH, 10_666_668);
  });

  it('acepta una imagen de 5 MB, que antes del cambio a 8 MB era rechazada', () => {
    const cinco = [...PNG, ...new Array(5_000_000 - PNG.length).fill(0)];
    const res = validateImageUpload(dataUrl('image/png', cinco));
    assert.equal(res.ok, true);
    assert.equal((res as any).mime, 'image/png');
  });

  it('rechaza una imagen de 9 MB con 413', () => {
    const nueve = [...PNG, ...new Array(9_000_000 - PNG.length).fill(0)];
    const res = validateImageUpload(dataUrl('image/png', nueve));
    assert.equal(res.ok, false);
    assert.equal((res as any).status, 413);
    assert.match((res as any).error, /8 MB/);
  });

  it('rechaza contenido vacío', () => {
    assert.equal(validateImageUpload('data:image/png;base64,').ok, false);
    assert.equal(validateImageUpload('').ok, false);
    assert.equal(validateImageUpload(null as never).ok, false);
  });

  it('rechaza lo que no es un data URL base64', () => {
    for (const raw of ['https://evil.example/x.png', 'file:///etc/passwd', 'data:image/png,notbase64']) {
      assert.equal(validateImageUpload(raw).ok, false, raw);
    }
  });
});

describe('subidas de imagen · la clave de almacenamiento la genera el servidor', () => {
  it('el nombre no incorpora nada que mande el usuario', () => {
    const name = storageFilename('png', 1700000000000, () => 0.5);
    assert.match(name, /^animaldex-1700000000000-[a-z0-9]+\.png$/);
  });

  it('dos subidas en el mismo milisegundo no comparten nombre', () => {
    let n = 0;
    const a = storageFilename('jpg', 1, () => (n++, 0.1));
    const b = storageFilename('jpg', 1, () => 0.9);
    assert.notEqual(a, b);
  });

  it('el Worker nombra el archivo con storageFilename y no con datos del cliente', () => {
    assert.match(workerCode, /form\.append\('file', blob, storageFilename\(ext\)\)/);
    assert.ok(!/animaldex-\$\{Date\.now\(\)\}/.test(workerCode), 'no debe quedar el nombre viejo');
  });
});

describe('el endpoint /upload', () => {
  const handler = workerCode.slice(
    workerCode.indexOf('async function handleUpload'),
    workerCode.indexOf('async function handleSms')
  );

  it('exige sesión antes de gastar cuota de Cloudflare', () => {
    assert.match(handler, /const userId = await authUser\(request, env, body\)/);
    assert.match(handler, /if \(!userId\) return json\(\{ error: '[^']+' \}, 401\)/);
  });

  it('valida por contenido y no por lo que declara el cliente', () => {
    assert.match(handler, /validateImageUpload\(body\.image\)/);
    assert.ok(
      !/data:\(image\\\/\[a-z\+\]\+\)/.test(handler),
      'no debe quedar la expresión regular que confiaba en el MIME del cliente'
    );
  });

  it('aplica rate limit por cuenta y por IP', () => {
    assert.match(handler, /uploadLimited\(userId, ip, Date\.now\(\)\)/);
    assert.match(handler, /429/);
    assert.match(workerCode, /function uploadLimited\(userId, ip, now\)/);
    assert.match(workerCode, /uploadCounterHit\(`u\|\$\{userId\}`/);
    assert.match(workerCode, /uploadCounterHit\(`i\|\$\{ip \|\| 'unknown'\}`/);
  });

  it('el cliente manda el token de sesión al subir', () => {
    const api = code(read('lib/api.ts'));
    assert.match(api, /post\('\/upload', \{ image: dataUrl \}, \{ auth: true \}\)/);
    assert.match(api, /headers\.Authorization = `Bearer \$\{token\}`/);
  });

  it('el módulo de entrada no exporta nada que no sea el handler', () => {
    // El runtime toma cada export nombrado del módulo de entrada como un
    // entrypoint; si alguno no es función, el Worker no arranca.
    assert.deepEqual(workerCode.match(/^export (?!default)\S+/gm) || [], []);
  });
});

describe('URLs a partir de contenido de usuario', () => {
  it('un QR con esquema ejecutable nunca se convierte en enlace abrible', () => {
    for (const raw of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'intent://evil#Intent;scheme=http;end',
      'content://com.android.providers/x',
    ]) {
      const res = resolveScannedValue(raw);
      assert.equal(res.kind, 'text', `${raw} debería quedar como texto plano`);
      assert.ok(!('url' in res), `${raw} no debe exponer una url abrible`);
    }
  });

  it('un QR https sí se resuelve como enlace', () => {
    // Una ruta de un solo segmento corto se interpreta como @usuario, así que
    // para probar el caso "enlace externo" hace falta una ruta más profunda.
    const res = resolveScannedValue('https://example.com/algun/camino?x=1');
    assert.equal(res.kind, 'url');
    assert.equal((res as { url: string }).url, 'https://example.com/algun/camino?x=1');
  });

  it('los deep links legítimos siguen funcionando', () => {
    assert.equal(resolveScannedValue('animaldex://pet/abc123').kind, 'pet');
    assert.equal(resolveScannedValue('https://animaldex.com/p/xyz').kind, 'post');
    assert.equal(resolveScannedValue('https://animaldex.com/pet/abc').kind, 'pet');
  });

  it('los enlaces de contacto se arman con teléfonos validados, no con texto libre', () => {
    assert.equal(buildTelUrl('javascript:alert(1)'), null);
    assert.equal(buildWhatsAppUrl('javascript:alert(1)', 'hola'), null);
    assert.equal(buildTelUrl('+5493875551234'), 'tel:+5493875551234');
    assert.match(String(buildWhatsAppUrl('+5493875551234', 'hola')), /^https:\/\/wa\.me\/\d+\?text=/);
  });

  it('un contacto con esquema inyectado no produce ninguna URL', () => {
    const action = resolveListingContactAction({
      method: 'whatsapp',
      value: 'javascript:alert(1)',
      fallbackPhone: null,
      title: 'Collar',
    });
    assert.equal(action.kind, 'none');
  });
});

describe('autorización de las mutaciones', () => {
  const endpoints: Array<[string, RegExp]> = [
    ['deleteAlert', /SELECT id FROM alerts WHERE id = \? AND user_id = \?/],
    ['deleteListing', /SELECT id FROM listings WHERE id = \? AND user_id = \?/],
    ['updatePost', /SELECT id FROM posts WHERE id = \? AND user_id = \?/],
    ['deletePost', /SELECT id, image FROM posts WHERE id = \? AND user_id = \?/],
    ['updatePet', /findOwnedPet\(env, body\.petId, userId\)/],
    ['deletePet', /findOwnedPet\(env, body\.petId, userId\)/],
  ];

  for (const [nombre, patron] of endpoints) {
    it(`${nombre} comprueba la propiedad contra el usuario autenticado`, () => {
      const start = workerCode.indexOf(`action === '${nombre}'`);
      assert.ok(start > 0, `no se encontró ${nombre}`);
      assert.match(workerCode.slice(start, start + 900), patron);
    });
  }

  it('publicar como página verifica que la página sea de la cuenta', () => {
    const matches = workerCode.match(/SELECT[^']*FROM profiles WHERE id = \? AND account_id = \?/g) || [];
    assert.ok(matches.length >= 3, `esperaba varias comprobaciones de página, hubo ${matches.length}`);
  });

  it('ningún endpoint toma el dueño de body.userId para autorizar', () => {
    // reelsMux usa body.userId sólo para decidir qué estados mostrar, y lo
    // compara contra el visitante autenticado.
    const reels = code(read('worker/reelsMux.js'));
    assert.match(reels, /const isOwner = !!\(viewerId && viewerId === targetUserId\)/);
    assert.ok(!/user_id = \$\{/.test(workerCode), 'el dueño nunca se interpola en SQL');
  });
});

describe('SQL e inputs', () => {
  it('no se interpola ningún valor de body dentro de una consulta', () => {
    const interpolado = workerCode.match(/d1\([^)]*`[^`]*\$\{[^}]*body\.[^}]*\}/g) || [];
    assert.deepEqual(interpolado, []);
  });

  it('los IN dinámicos se arman con marcadores, no con valores', () => {
    for (const m of workerCode.match(/const ph = [^\n]+/g) || []) {
      assert.match(m, /map\(\(\) => '\?'\)\.join\(','\)/);
    }
  });

  it('las entradas de texto pasan por clean() con un tope de longitud', () => {
    const sinTope = workerCode.match(/clean\(body\.[a-zA-Z]+\)/g) || [];
    assert.deepEqual(sinTope, [], 'clean() siempre debe recibir un máximo');
  });
});

describe('privacidad · nada de lo aprobado se debilita', () => {
  it('las guardas siguen existiendo', () => {
    assert.match(read('lib/lastLocation.ts'), /export function publicPayloadHasUserCoords/);
    assert.match(read('lib/pushPolicy.ts'), /export function payloadHasSensitiveLocation/);
    assert.match(workerIndex, /function stripAlertCoords/);
    assert.match(workerCode, /return alerts\.map\(stripAlertCoords\)/);
  });

  it('el hardening no agregó logs con datos sensibles', () => {
    const logs = workerCode.match(/console\.(log|warn|error|info|debug)\([^\n]*/g) || [];
    for (const l of logs) {
      assert.ok(
        !/(lat|lon|lng|token|password|pass_hash|coord|sessionToken|image|base64)/i.test(l),
        `log con dato sensible: ${l}`
      );
    }
  });

  it('el módulo de subida no registra el contenido de la imagen', () => {
    const mod = code(read('worker/imageUpload.js'));
    assert.ok(!/console\./.test(mod));
  });
});

// ------------------------------------------------------------
// Adaptive icon
// ------------------------------------------------------------

/** Decodifica un PNG RGBA8 sin interlace (suficiente para los assets propios). */
function decodePng(relPath: string) {
  const buf = readFileSync(join(root, relPath));
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];
  assert.equal(bitDepth, 8, `${relPath}: se espera 8 bits por canal`);
  assert.equal(colorType, 6, `${relPath}: se espera RGBA`);
  assert.equal(interlace, 0, `${relPath}: se espera sin interlace`);

  const idat: Buffer[] = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));

  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos];
    pos += 1;
    for (let x = 0; x < stride; x += 1) {
      const cur = raw[pos + x];
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let val = cur;
      if (filter === 1) val = cur + a;
      else if (filter === 2) val = cur + b;
      else if (filter === 3) val = cur + ((a + b) >> 1);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        val = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      out[y * stride + x] = val & 0xff;
    }
    pos += stride;
  }
  return {
    width,
    height,
    alphaAt: (x: number, y: number) => out[y * stride + x * bpp + 3],
    rgbaAt: (x: number, y: number) => {
      const i = y * stride + x * bpp;
      return [out[i], out[i + 1], out[i + 2], out[i + 3]];
    },
  };
}

describe('adaptive icon de Android', () => {
  const app = JSON.parse(read('app.json')).expo;
  const adaptive = app.android.adaptiveIcon;
  const ORANGE = '#FD6904';

  it('el fondo es el naranja de Animaldex, no un beige claro', () => {
    assert.equal(adaptive.backgroundColor, ORANGE);
  });

  it('no hay backgroundImage: en Expo la imagen pisa al color y era la que traía el beige', () => {
    assert.ok(!('backgroundImage' in adaptive), 'backgroundImage debe quedar fuera de la configuración');
    assert.ok(!existsSync(join(root, 'assets/android-icon-background.png')), 'el PNG beige debe estar eliminado');
  });

  it('siguen declaradas las capas foreground y monochrome', () => {
    assert.equal(adaptive.foregroundImage, './assets/android-icon-foreground.png');
    assert.equal(adaptive.monochromeImage, './assets/android-icon-monochrome.png');
  });

  for (const capa of ['android-icon-foreground.png', 'android-icon-monochrome.png']) {
    describe(capa, () => {
      const png = decodePng(`assets/${capa}`);

      it('mide 1024x1024', () => {
        assert.equal(png.width, 1024);
        assert.equal(png.height, 1024);
      });

      it('tiene transparencia real en las cuatro esquinas', () => {
        for (const [x, y] of [[0, 0], [1023, 0], [0, 1023], [1023, 1023]]) {
          assert.equal(png.alphaAt(x, y), 0, `esquina ${x},${y} debería ser transparente`);
        }
      });

      it('no incrusta un segundo cuadrado: el borde de la máscara está vacío', () => {
        // La máscara muestra los 72dp centrales de 108dp: de 171 a 853 px.
        // Un cuadrado incrustado dejaría píxeles opacos pegados a ese borde.
        for (const p of [171, 300, 512, 700, 853]) {
          assert.equal(png.alphaAt(p, 171), 0, `fila superior de la máscara opaca en x=${p}`);
          assert.equal(png.alphaAt(p, 853), 0, `fila inferior de la máscara opaca en x=${p}`);
          assert.equal(png.alphaAt(171, p), 0, `columna izquierda opaca en y=${p}`);
          assert.equal(png.alphaAt(853, p), 0, `columna derecha opaca en y=${p}`);
        }
      });

      it('el logo entra en la safe zone de 66dp y está centrado', () => {
        let minX = 1024;
        let minY = 1024;
        let maxX = -1;
        let maxY = -1;
        for (let y = 0; y < 1024; y += 1) {
          for (let x = 0; x < 1024; x += 1) {
            if (png.alphaAt(x, y) > 8) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        const w = maxX - minX + 1;
        const h = maxY - minY + 1;
        const safeDiameter = (1024 * 66) / 108;
        assert.ok(
          Math.hypot(w, h) <= safeDiameter + 2,
          `la diagonal del logo (${Math.hypot(w, h).toFixed(0)}) excede la safe zone (${safeDiameter.toFixed(0)})`
        );
        assert.ok(Math.abs((minX + maxX + 1) / 2 - 512) <= 2, 'no está centrado horizontalmente');
        assert.ok(Math.abs((minY + maxY + 1) / 2 - 512) <= 2, 'no está centrado verticalmente');
        assert.ok(w > 300, 'el logo quedó demasiado chico dentro de la máscara');
      });

      it('el logo es blanco, para contrastar contra el naranja del fondo', () => {
        const [r, g, b, a] = png.rgbaAt(512, 512);
        assert.equal(a, 255);
        assert.ok(r > 240 && g > 240 && b > 240, `el centro del logo debería ser blanco, es ${r},${g},${b}`);
      });
    });
  }
});

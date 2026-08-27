// ============================================================
// Animaldex — Cloudflare Pages "Advanced Mode" Worker
// ============================================================
// Reemplaza al middleware.js + api/og.js de Vercel (que ya no se usan
// en este hosting). Este único archivo:
//
// 1) Detecta bots de redes sociales (WhatsApp, Facebook, Twitter...)
//    y les sirve HTML con meta etiquetas Open Graph (foto + título)
//    para los enlaces /p/:id, /pet/:id, /a/:id, /m/:id y la portada.
// 2) Para el resto de las visitas (usuarios reales), sirve los
//    archivos estáticos generados por `expo export` normalmente,
//    con fallback a index.html para las rutas de la SPA (mismo
//    comportamiento que el "rewrites" de vercel.json).
//
// Consulta D1 vía la API HTTP de Cloudflare (mismo mecanismo que ya
// usaba api/og.js en Vercel) usando un token guardado como secreto de
// Pages (CF_D1_TOKEN). Nota: "wrangler pages deploy" no admite un
// wrangler.toml en ruta personalizada, y el wrangler.toml de la raíz
// ya pertenece al Worker del backend (animaldex-api) — por eso este
// Worker de Pages NO usa binding nativo a D1, para no tener que tocar
// esa configuración.
//
// IMPORTANTE: este archivo es la FUENTE. Antes de cada deploy hay que
// copiarlo a dist/_worker.js (expo export borra dist/ por completo en
// cada build). Ver scripts/deploy-cf-pages.sh.
// ============================================================

// ---------- Android App Links: Digital Asset Links ----------
// Se sirve en /.well-known/assetlinks.json para verificar la asociación
// entre este dominio y la app Android (package com.lucasap123.animaldex).
// El SHA-256 de EAS/Preview (upload keystore) DEBE conservarse para que
// la APK Preview siga verificando. Play App Signing usa OTRO certificado:
// hay que AÑADIR su huella, no reemplazar la de EAS. Ambos conviven.
const ASSETLINKS_JSON = JSON.stringify([
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.lucasap123.animaldex',
      sha256_cert_fingerprints: [
        'AF:CE:8E:B1:04:D3:4C:6F:DF:61:C3:5F:15:73:3D:58:D9:F3:AE:90:41:2F:BA:BE:0C:FC:FB:C9:C0:C5:17:E6',
        '9D:2A:54:C2:2D:DA:99:C0:39:BB:A2:73:B5:B3:8A:80:2D:22:05:D8:E2:7B:1D:6C:20:30:F9:58:51:8B:44:46',
      ],
    },
  },
]);

const BOT_RE =
  /facebookexternalhit|facebot|facebookcatalog|meta-externalagent|meta-externalads|twitterbot|whatsapp|telegrambot|linkedinbot|slackbot|slack-imgproxy|discordbot|pinterest|googlebot|bingbot|yandex|baiduspider|vkshare|redditbot|applebot|flipboard|tumblr|skypeuripreview|nuzzel|quora|bitlybot|embedly|iframely|snap url preview|viber|line-poker|kakaotalk|google-pagerenderer|preview/i;

const ANIMALDEX_OG_IMAGE = 'https://placedog.net/600/600?id=12';

// ---------- RNG determinista (idéntico a lib/data.ts, para posts demo) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PETS = [
  { id: 'p1', name: 'Luna', species: 'perro', breed: 'Golden Retriever', emoji: '🐕', bio: 'Experta en atrapar pelotas y robar corazones 🎾💛', avatarSeed: 11 },
  { id: 'p2', name: 'Michi', species: 'gato', breed: 'Siamés', emoji: '🐱', bio: 'Juez supremo de la casa. Acepto tributos en atún 🐟', avatarSeed: 22 },
  { id: 'p3', name: 'Rocky', species: 'perro', breed: 'Bulldog Francés', emoji: '🐶', bio: 'Ronco cuando duermo y también cuando estoy despierto 😤', avatarSeed: 33 },
  { id: 'p4', name: 'Nube', species: 'conejo', breed: 'Holandés enano', emoji: '🐰', bio: 'Saltarina profesional. Las zanahorias son vida 🥕', avatarSeed: 44 },
  { id: 'p5', name: 'Kiwi', species: 'loro', breed: 'Guacamayo', emoji: '🦜', bio: 'Sé decir 47 palabras y ninguna es "silencio" 🗣️', avatarSeed: 55 },
  { id: 'p6', name: 'Simba', species: 'gato', breed: 'Atigrado naranja', emoji: '🐈', bio: 'El rey león de departamento. Rugido nivel: miau 🦁', avatarSeed: 66 },
  { id: 'p7', name: 'Max', species: 'perro', breed: 'Labrador', emoji: '🐕', bio: 'Buen chico certificado ⭐ Nadador olímpico de piscinas inflables', avatarSeed: 77 },
  { id: 'p8', name: 'Coco', species: 'perro', breed: 'Poodle', emoji: '🐩', bio: 'Mi peinado cuesta más que tu café ✨🐩', avatarSeed: 88 },
  { id: 'p9', name: 'Pelusa', species: 'hámster', breed: 'Sirio dorado', emoji: '🐹', bio: 'Corro 5km cada noche en mi rueda. Atleta de élite 🏃', avatarSeed: 99 },
  { id: 'p10', name: 'Toby', species: 'perro', breed: 'Beagle', emoji: '🐶', bio: 'Detective de olores. Ningún snack está a salvo 🔍', avatarSeed: 110 },
  { id: 'p11', name: 'Mia', species: 'gato', breed: 'Persa', emoji: '🐈‍⬛', bio: 'Elegancia, pelo y desdén en partes iguales 👑', avatarSeed: 121 },
  { id: 'p12', name: 'Bruno', species: 'perro', breed: 'Pastor Alemán', emoji: '🦮', bio: 'Guardián del hogar y de las galletas 🍪🛡️', avatarSeed: 132 },
  { id: 'p13', name: 'Olivia', species: 'gato', breed: 'Bengalí', emoji: '🐱', bio: 'Mitad gata, mitad leopardo, 100% caos 🐆', avatarSeed: 143 },
  { id: 'p14', name: 'Chispa', species: 'perro', breed: 'Corgi', emoji: '🐕', bio: 'Patas cortas, sueños grandes 🚀', avatarSeed: 154 },
];

const CAPTIONS = {
  perro: [
    'Día de parque con mi humana favorita 🌳🎾 #VidaDePerro',
    '¿Alguien dijo P-A-S-E-O? 👂🐾',
    'Modo siesta activado después de correr toda la mañana 😴',
    'Nuevo juguete, mismo destino: destruido en 10 minutos 🧸💥',
    'Ese momento incómodo cuando el veterinario dice que estoy "llenito" 🙄',
    'Hoy aprendí a dar la pata... por quinta vez esta semana 🐾✋',
    'Baño terminado. Dignidad: en recuperación 🛁',
    'Vigilando la casa (desde el sofá, con los ojos cerrados) 🛋️',
    'Encontré un charco. Mi humano encontró un problema 💦😅',
    'La cara que pongo cuando escucho la bolsa de croquetas 👀',
  ],
  gato: [
    'He decidido que esta caja es mi nuevo hogar 📦',
    'Desperté a mi humano a las 4am. Misión cumplida 😼',
    'El sol se mueve, yo me muevo con él ☀️ #SiestaProfesional',
    'Tiré un vaso de la mesa. Fue arte performático 🎨',
    'Hoy ignoré a todos con mucho éxito 💅',
    'Mi humano compró una cama de $50. Yo elegí la bolsa de papel 🛍️',
    'Reunión importante en el techo del vecino a las 3pm 🐾',
    'Modo pan de molde activado 🍞',
    'Las plantas de la casa ya saben quién manda 🌿😹',
    'Ronroneo nivel: motor de tractor 🚜💤',
  ],
  conejo: [
    'Zanahoria del día conseguida 🥕✨',
    'Salto triple con giro. Los jueces dieron 10/10 🤸',
    'Mis orejas escucharon que abriste la nevera 👂',
    'Binky de felicidad porque sí 🐰💫',
    'Escondida entre los cojines, nadie me encontrará 🛋️',
    'Hora de mordisquear todo lo que encuentre 🦷',
  ],
  loro: [
    '¡HOLA! ¡HOLA! ¡HOLA! (me encanta esa palabra) 🗣️',
    'Aprendí a imitar el timbre. Mis humanos ya no confían en nada 🔔😈',
    'Semillas de girasol: la moneda oficial de esta casa 🌻',
    'Cantando a las 6am porque el mundo necesita mi arte 🎶',
    'Hoy volé por toda la sala. Turbulencia leve, aterrizaje perfecto ✈️',
    'Bailando al ritmo de la cumbia con mi humano 💃🦜',
  ],
  hámster: [
    'Llené mis cachetes con provisiones para el invierno... en verano 🐹',
    'Corrí 5km en mi rueda. ¿Adónde llegué? A ningún lado, pero feliz 🎡',
    'Remodelé mi casa: todo el aserrín en una esquina 🏗️',
    'Semilla encontrada. Día perfecto 🌻',
    'Escapé 10 minutos. Fui leyenda. Me encontraron en la pantufla 🥿',
    'Mi túnel nuevo es una obra maestra de la ingeniería 🚇',
  ],
};

function petImage(species, seed, size) {
  size = size || 600;
  const n = Math.abs(seed) % 900;
  switch (species) {
    case 'perro':
      return `https://placedog.net/${size}/${size}?id=${(n % 200) + 1}`;
    case 'gato':
      return `https://loremflickr.com/${size}/${size}/cat?lock=${n}`;
    case 'conejo':
      return `https://loremflickr.com/${size}/${size}/rabbit,bunny?lock=${n}`;
    case 'loro':
      return `https://loremflickr.com/${size}/${size}/parrot?lock=${n}`;
    default:
      return `https://loremflickr.com/${size}/${size}/hamster,rodent?lock=${n}`;
  }
}

function makePostMeta(seed, forcePet) {
  const rng = mulberry32(seed * 7919 + 4231);
  const pet = forcePet || PETS[Math.floor(rng() * PETS.length)];
  const captions = CAPTIONS[pet.species];
  const caption = captions[Math.floor(rng() * captions.length)];
  const imgSeed = Math.floor(rng() * 900) + seed;
  return { pet, caption, image: petImage(pet.species, imgSeed, 600) };
}

function resolvePostMeta(postId, d) {
  if (d) {
    try {
      // atob (Workers runtime) en vez de Buffer (Node) — base64url simple.
      const b64 = String(d).replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        Array.prototype.map
          .call(atob(b64), (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
          .join('')
      );
      const o = JSON.parse(json);
      const pet = PETS.find((p) => p.id === o.petId);
      if (pet && o.image) return { pet, caption: o.caption || '', image: o.image };
    } catch {
      /* enlace corrupto → seguir con el ID */
    }
  }
  if (!postId) return null;
  let m = String(postId).match(/^feed-(\d+)$/);
  if (m) return makePostMeta(Number(m[1]));
  m = String(postId).match(/^explore-(\d+)$/);
  if (m) return makePostMeta(Number(m[1]) + 50000);
  m = String(postId).match(/^pet-(p\d+)-(\d+)$/);
  if (m) {
    const pet = PETS.find((p) => p.id === m[1]);
    if (!pet) return null;
    const base = hashStr(pet.id) % 10000;
    return makePostMeta(base + Number(m[2]) * 17, pet);
  }
  return null;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ogHtml({ title, description, image, url }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta property="og:site_name" content="Animaldex" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${esc(image)}" />
  <meta property="og:image:width" content="600" />
  <meta property="og:image:height" content="600" />
  <meta property="og:url" content="${esc(url)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(image)}" />
</head>
<body>
  <p><a href="${esc(url)}">${esc(title)}</a></p>
  <p>${esc(description)}</p>
  <img src="${esc(image)}" alt="${esc(title)}" width="300" />
</body>
</html>`;
}

// ---------- D1 vía API HTTP de Cloudflare (token en env.CF_D1_TOKEN) ----------
async function d1Query(env, sql, params) {
  try {
    if (!env.CF_D1_TOKEN || !env.CF_ACCOUNT_ID || !env.CF_D1_DATABASE_ID) return [];
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/d1/database/${env.CF_D1_DATABASE_ID}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.CF_D1_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql, params }),
      }
    );
    const json = await resp.json();
    if (!json.success) return [];
    return json.result[0] ? json.result[0].results || [] : [];
  } catch {
    return [];
  }
}

async function buildOgMeta(request, env, url) {
  const origin = url.origin;
  const pathname = url.pathname;
  let meta = null;

  const petMatch = pathname.match(/^\/pet\/([^/]+)\/?$/);
  const alertMatch = pathname.match(/^\/a\/([^/]+)\/?$/);
  const listingMatch = pathname.match(/^\/m\/([^/]+)\/?$/);
  const postMatch = pathname.match(/^\/p\/([^/]+)\/?$/);
  const handleMatch = pathname.match(/^\/([a-z0-9_.]{3,20})\/?$/i);
  // Keep in sync with lib/publicHandles.ts and worker/index.js
  const reserved = new Set([
    'p', 'pet', 'a', 'm', 'login', 'register', 'auth', 'feed', 'reels', 'alerts', 'alertas',
    'marketplace', 'mercado', 'admin', 'api', 'crear', 'actividad', 'perfil', 'explorar',
    'verificar', 'escanear', 'entrar', 'tienda', 'vender', 'user', 'users', 'assets', '_expo',
    'index', 'home', 'app', 'www', 'static', 'public', 'nueva-mascota', 'editar-perfil',
    'editar-perfil-publico', 'crear-alerta', 'mercado-favoritos', 'favicon.ico', 'robots.txt',
    'well-known',
  ]);

  if (petMatch) {
    const id = decodeURIComponent(petMatch[1]);
    const demoPet = PETS.find((p) => p.id === id);
    if (demoPet) {
      meta = {
        title: `${demoPet.name} ${demoPet.emoji} en Animaldex`,
        description: `${demoPet.breed} · ${demoPet.bio}`,
        image: petImage(demoPet.species, demoPet.avatarSeed, 600),
        url: `${origin}/pet/${demoPet.id}`,
      };
    } else {
      const rows = await d1Query(env, 'SELECT * FROM pets WHERE id = ? OR LOWER(username) = LOWER(?) LIMIT 1', [id, id]);
      if (rows[0]) {
        const p = rows[0];
        meta = {
          title: `${p.name} ${p.emoji || '🐾'} en Animaldex`,
          description: `${p.breed || p.species}${p.bio ? ' · ' + p.bio : ''}`,
          image: p.avatar_url || petImage('perro', 11, 600),
          url: `${origin}/pet/${p.id}`,
        };
      }
    }
  } else if (alertMatch) {
    const id = decodeURIComponent(alertMatch[1]);
    const rows = await d1Query(env, 'SELECT * FROM alerts WHERE id = ?', [id]);
    if (rows[0]) {
      const a = rows[0];
      const typeLabel = a.type === 'found' ? 'ENCONTRADO' : 'PERDIDO';
      const speciesLabel = { perro: 'Perro', gato: 'Gato', conejo: 'Conejo', loro: 'Ave', hámster: 'Hámster' }[a.species] || 'Animal';
      const name = a.pet_name ? ` ${a.pet_name}` : '';
      meta = {
        title: `🚨 ${speciesLabel.toUpperCase()} ${typeLabel}${name} · Animaldex`,
        description: `${a.description || ''} · 📍 ${a.locality}`.trim(),
        image: a.image,
        url: `${origin}/a/${a.id}`,
      };
    }
  } else if (listingMatch) {
    const id = decodeURIComponent(listingMatch[1]);
    const rows = await d1Query(env, 'SELECT * FROM listings WHERE id = ?', [id]);
    if (rows[0]) {
      const l = rows[0];
      let images = [];
      try {
        images = JSON.parse(l.images || '[]');
      } catch {}
      const kindLabel = l.kind === 'service' ? 'Servicio' : 'Producto';
      meta = {
        title: `${l.kind === 'service' ? '🛠️' : '🛍️'} ${l.title} · Mercado Animaldex`,
        description: `${kindLabel} · 🐾 ${Number(l.price_patitas || 0).toLocaleString('es-AR')} Patitas · 📍 ${l.locality}`,
        image: images[0] || petImage('perro', 11, 600),
        url: `${origin}/m/${l.id}`,
      };
    }
  } else if (postMatch) {
    const id = decodeURIComponent(postMatch[1]);
    const d = url.searchParams.get('d');
    const resolved = resolvePostMeta(id, d);
    if (resolved) {
      const query = d ? `?d=${encodeURIComponent(d)}` : '';
      meta = {
        title: `${resolved.pet.name} ${resolved.pet.emoji} en Animaldex`,
        description: resolved.caption || `Una publicación de ${resolved.pet.name} en Animaldex 🐾`,
        image: resolved.image,
        url: `${origin}/p/${id}${query}`,
      };
    } else {
      const rows = await d1Query(
        env,
        `SELECT p.*, pet.name AS pet_name, pet.emoji AS pet_emoji
         FROM posts p LEFT JOIN pets pet ON pet.id = p.pet_id WHERE p.id = ?`,
        [id]
      );
      if (rows[0]) {
        const p = rows[0];
        meta = {
          title: `${p.pet_name || 'Una mascota'} ${p.pet_emoji || '🐾'} en Animaldex`,
          description: p.caption || 'Una publicación adorable en Animaldex 🐾',
          // Posts de texto+fondo no tienen foto propia: una sola imagen OG
          // genérica (o la del catálogo si algún fondo gráfico tiene URL).
          // No se rasteriza texto+fondo por publicación.
          image: p.image || ANIMALDEX_OG_IMAGE,
          url: `${origin}/p/${p.id}`,
        };
      }
    }
  } else if (handleMatch && !reserved.has(handleMatch[1].toLowerCase())) {
    const handle = handleMatch[1].toLowerCase();
    const profiles = await d1Query(env, 'SELECT * FROM profiles WHERE LOWER(username) = ? LIMIT 1', [handle]);
    if (profiles[0]) {
      const pr = profiles[0];
      const bio = String(pr.bio || '').replace(/\s+/g, ' ').trim();
      if (pr.type === 'protector' || pr.type === 'business') {
        const counts = await d1Query(
          env,
          'SELECT COUNT(*) AS n FROM pets WHERE profile_id = ? AND archived_at IS NULL',
          [pr.id]
        );
        const petsN = Number((counts[0] && counts[0].n) || 0);
        meta = {
          title: `${pr.name} | Animaldex`,
          description: `🐾 @${pr.username} · Mascotas: ${petsN}${bio ? ' · ' + bio : ''}`,
          image: pr.avatar_url || petImage('perro', 11, 600),
          url: `${origin}/${pr.username}`,
        };
      } else {
        meta = {
          title: `${pr.name} | Animaldex`,
          description: `🐾 @${pr.username}${bio ? ' · ' + bio : ''}`,
          image: pr.avatar_url || petImage('perro', 11, 600),
          url: `${origin}/${pr.username}`,
        };
      }
      } else {
        const users = await d1Query(env, 'SELECT * FROM users WHERE LOWER(username) = ? LIMIT 1', [handle]);
        if (users[0]) {
          const u = users[0];
          const bio = String(u.bio || '').replace(/\s+/g, ' ').trim();
          meta = {
            title: `${u.name} | Animaldex`,
            description: `🐾 @${u.username}${bio ? ' · ' + bio : ''}`,
            image: u.avatar_url || petImage('perro', 11, 600),
            url: `${origin}/${u.username}`,
          };
        }
      }
  }

  if (!meta) {
    meta = {
      title: 'Animaldex · La red social de tus mascotas 🐾',
      description: 'Comparte fotos de tus mascotas, sigue a otros peluditos y descubre perfiles adorables.',
      image: petImage('perro', 11, 600),
      url: origin,
    };
  }

  return meta;
}

const OG_PATH_RE = /^(\/p\/|\/pet\/|\/a\/|\/m\/)|^\/$|^\/[a-z0-9_.]{3,20}\/?$/i;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const ua = request.headers.get('user-agent') || '';

    // 0) Android App Links: servir el archivo de verificación de dominio
    //    con content-type application/json (requisito de Google/Android).
    //    Debe ir antes de cualquier otra lógica (bots, assets, SPA).
    if (url.pathname === '/.well-known/assetlinks.json') {
      return new Response(ASSETLINKS_JSON, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // 1) Bots de redes sociales en rutas con preview: servir OG HTML.
    if (BOT_RE.test(ua) && OG_PATH_RE.test(url.pathname)) {
      const meta = await buildOgMeta(request, env, url);
      return new Response(ogHtml(meta), {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=300, s-maxage=3600',
          'Vary': 'User-Agent',
        },
      });
    }

    // 2) Usuarios normales: servir los archivos estáticos de la SPA.
    //
    // Nota: "wrangler pages deploy" respeta .gitignore al subir archivos,
    // y el proyecto ignora "node_modules/" (patrón universal) -> los assets
    // vendorizados por Metro bajo assets/node_modules/... (ej. la fuente de
    // Ionicons, íconos de @react-navigation/elements) NUNCA se suben, y
    // Cloudflare responde con el fallback de la SPA (200 + index.html)
    // *silenciosamente* en vez de un 404 -> la fuente de Ionicons nunca
    // carga -> pantalla en blanco infinita (fontsLoaded nunca pasa a true).
    // El script de deploy genera copias "espejo" de esos archivos sin la
    // palabra "node_modules" ni "@" en el path; aquí reescribimos la
    // request para pedir esa copia en vez de la ruta original problemática.
    let assetRequest = request;
    if (url.pathname.includes('node_modules') || url.pathname.includes('@')) {
      const safeUrl = new URL(url.toString());
      safeUrl.pathname = url.pathname.replace(/node_modules/g, 'vendor_modules').replace(/@/g, '_');
      assetRequest = new Request(safeUrl.toString(), request);
    }

    const assetResponse = await env.ASSETS.fetch(assetRequest);

    const spaHandle = (url.pathname.match(/^\/([a-z0-9_.]{3,20})\/?$/i) || [])[1];
    const spaReserved = new Set([
      'p','pet','a','m','reels','alertas','mercado','crear','actividad','perfil',
      'explorar','verificar','escanear','entrar','tienda','admin','vender',
      'editar-perfil','editar-perfil-publico','user','assets','_expo','favicon.ico','robots.txt',
    ]);
    const maybeProfile = spaHandle && !spaReserved.has(spaHandle.toLowerCase());
    const maybePet = /^\/pet\/[^/]+\/?$/.test(url.pathname);
    const assetType = (assetResponse.headers.get('content-type') || '').toLowerCase();
    const assetIsHtml = assetResponse.status === 404 || assetType.includes('text/html');

    // 3) /{username} y /pet/:id para humanos (o crawlers que no matchean BOT_RE):
    //    inyectar las mismas meta OG que ogHtml(), reutilizando buildOgMeta.
    if ((maybeProfile || maybePet) && assetIsHtml) {
      const meta = await buildOgMeta(request, env, url);
      const expectedPath = maybePet
        ? url.pathname.replace(/\/$/, '')
        : '/' + spaHandle.toLowerCase();
      let metaPath = '';
      try { metaPath = new URL(meta.url).pathname.replace(/\/$/, '') || '/'; } catch (_) {}
      const matched = maybePet
        ? metaPath.indexOf('/pet/') === 0
        : metaPath === expectedPath;
      if (meta && matched) {
        const source = assetResponse.status === 404
          ? await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin).toString(), request))
          : assetResponse;
        const html = await source.text();
        return new Response(injectOgIntoSpa(html, meta), {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=0, must-revalidate',
            'Vary': 'User-Agent',
          },
        });
      }
    }

    if (assetResponse.status !== 404) return assetResponse;

    const indexUrl = new URL('/index.html', url.origin);
    return env.ASSETS.fetch(new Request(indexUrl.toString(), request));
  },
};

function injectOgIntoSpa(html, meta) {
  const tags = `
  <title>${esc(meta.title)}</title>
  <meta name="description" content="${esc(meta.description)}" />
  <meta property="og:site_name" content="Animaldex" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${esc(meta.title)}" />
  <meta property="og:description" content="${esc(meta.description)}" />
  <meta property="og:image" content="${esc(meta.image)}" />
  <meta property="og:image:width" content="600" />
  <meta property="og:image:height" content="600" />
  <meta property="og:url" content="${esc(meta.url)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(meta.title)}" />
  <meta name="twitter:description" content="${esc(meta.description)}" />
  <meta name="twitter:image" content="${esc(meta.image)}" />
`;
  let out = html.replace(/<title>[\s\S]*?<\/title>/i, '');
  if (out.includes('</head>')) return out.replace('</head>', tags + '</head>');
  return tags + out;
}

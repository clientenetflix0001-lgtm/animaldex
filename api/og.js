// Animaldex — Open Graph serverless function
// Genera las meta etiquetas (foto + título) para los enlaces compartidos /p/<id> y /pet/<id>.
// Replica la generación determinista de publicaciones de la app (lib/data.ts).

// ---------- RNG determinista (idéntico a lib/data.ts) ----------
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

// ---------- Datos (espejo de lib/data.ts) ----------
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
  'hámster': [
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

// Replica exacta de makePost() (solo caption e imagen)
function makePostMeta(seed, forcePet) {
  const rng = mulberry32(seed * 7919 + 4231);
  const pet = forcePet || PETS[Math.floor(rng() * PETS.length)];
  const captions = CAPTIONS[pet.species];
  const caption = captions[Math.floor(rng() * captions.length)];
  const imgSeed = Math.floor(rng() * 900) + seed;
  return { pet, caption, image: petImage(pet.species, imgSeed, 600) };
}

function resolvePostMeta(postId, d) {
  // Publicaciones creadas por el usuario: viajan codificadas en "d"
  if (d) {
    try {
      const o = JSON.parse(Buffer.from(String(d), 'base64url').toString('utf8'));
      const pet = PETS.find((p) => p.id === o.petId);
      if (pet && o.image) {
        return { pet, caption: o.caption || '', image: o.image };
      }
    } catch (e) {
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

// ---------- Consulta a D1 para publicaciones/mascotas reales ----------
const config = require('./_config.js');

async function d1Query(sql, params) {
  try {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.CF_ACCOUNT_ID}/d1/database/${config.CF_D1_DATABASE_ID}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.CF_D1_TOKEN}`,
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

module.exports = async (req, res) => {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'animaldex.vercel.app';
  const origin = `${proto}://${host}`;

  const { type, id, d } = req.query || {};

  let meta = null;

  if (type === 'pet' && id) {
    const pet = PETS.find((p) => p.id === id);
    if (pet) {
      meta = {
        title: `${pet.name} ${pet.emoji} en Animaldex`,
        description: `${pet.breed} · ${pet.bio}`,
        image: petImage(pet.species, pet.avatarSeed, 600),
        url: `${origin}/pet/${pet.id}`,
      };
    } else {
      // Mascota real en la base de datos
      const rows = await d1Query('SELECT * FROM pets WHERE id = ?', [String(id)]);
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
  } else if (type === 'alert' && id) {
    const rows = await d1Query('SELECT * FROM alerts WHERE id = ?', [String(id)]);
    if (rows[0]) {
      const a = rows[0];
      const typeLabel = a.type === 'found' ? 'ENCONTRADO' : 'PERDIDO';
      const speciesLabel = { perro: 'Perro', gato: 'Gato', conejo: 'Conejo', loro: 'Ave', 'hámster': 'Hámster' }[a.species] || 'Animal';
      const name = a.pet_name ? ` ${a.pet_name}` : '';
      meta = {
        title: `🚨 ${speciesLabel.toUpperCase()} ${typeLabel}${name} · Animaldex`,
        description: `${a.description || ''} · 📍 ${a.locality}`.trim(),
        image: a.image,
        url: `${origin}/a/${a.id}`,
      };
    }
  } else if (type === 'reel' && id) {
    const rows = await d1Query('SELECT * FROM reels WHERE id = ?', [String(id)]);
    if (rows[0]) {
      const r = rows[0];
      const creator = r.creator_username ? `@${r.creator_username}` : 'un creador de TikTok';
      meta = {
        title: `🎬 Reel de ${creator} · Animaldex`,
        description: r.title || 'Un video de mascotas compartido en Animaldex 🐾',
        image: r.thumbnail_url || petImage('perro', 11, 600),
        url: `${origin}/r/${r.id}`,
      };
    }
  } else if (type === 'post' && id) {
    const resolved = resolvePostMeta(id, d);
    if (resolved) {
      const query = d ? `?d=${encodeURIComponent(String(d))}` : '';
      meta = {
        title: `${resolved.pet.name} ${resolved.pet.emoji} en Animaldex`,
        description: resolved.caption || `Una publicación de ${resolved.pet.name} en Animaldex 🐾`,
        image: resolved.image,
        url: `${origin}/p/${id}${query}`,
      };
    } else {
      // Publicación real en la base de datos
      const rows = await d1Query(
        `SELECT p.*, pet.name AS pet_name, pet.emoji AS pet_emoji
         FROM posts p LEFT JOIN pets pet ON pet.id = p.pet_id WHERE p.id = ?`,
        [String(id)]
      );
      if (rows[0]) {
        const p = rows[0];
        meta = {
          title: `${p.pet_name || 'Una mascota'} ${p.pet_emoji || '🐾'} en Animaldex`,
          description: p.caption || 'Una publicación adorable en Animaldex 🐾',
          image: p.image,
          url: `${origin}/p/${p.id}`,
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

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
  res.status(200).send(ogHtml(meta));
};

// ---------- Types ----------
export type Species = 'perro' | 'gato' | 'conejo' | 'loro' | 'hámster';

export interface User {
  id: string;
  name: string;
  username: string;
  avatar: string;
  bio: string;
  location: string;
  petIds: string[];
}

export interface Pet {
  id: string;
  name: string;
  species: Species;
  breed: string;
  age: string;
  bio: string;
  emoji: string;
  ownerId: string;
  followers: number;
  following: number;
  avatarSeed: number;
}

export interface Comment {
  id: string;
  userId: string;
  text: string;
  minutesAgo: number;
}

export interface Post {
  id: string;
  petId: string;
  image: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
  caption: string;
  likes: number;
  minutesAgo: number;
  comments: Comment[];
  /** Id de catálogo para posts de solo texto. Null/ausente = foto o texto legado. */
  backgroundId?: string | null;
  // Campos presentes solo en publicaciones reales (base de datos)
  real?: boolean;
  authorUserId?: string;
  petName?: string;
  petEmoji?: string;
  petSpecies?: string;
  petAvatarUrl?: string | null;
  petUsername?: string;
  username?: string;
  commentCount?: number;
  authorProfileId?: string;
  authorProfileType?: 'personal' | 'business' | 'protector';
  authorProfileName?: string;
  authorProfileUsername?: string;
  authorProfileAvatar?: string | null;
}

export interface Notification {
  id: string;
  type: 'like' | 'follow' | 'comment' | 'mention';
  userId: string;
  petId?: string;
  text: string;
  minutesAgo: number;
  image?: string;
}

// ---------- Seeded RNG ----------
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------- Images ----------
export function petImage(species: Species, seed: number, size = 600): string {
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
    case 'hámster':
      return `https://loremflickr.com/${size}/${size}/hamster,rodent?lock=${n}`;
  }
}

export function petAvatar(pet: Pet): string {
  return petImage(pet.species, pet.avatarSeed, 300);
}

// ---------- Users ----------
export const CURRENT_USER_ID = 'u0';

export const USERS: User[] = [
  {
    id: 'u0',
    name: 'Sofía Ramírez',
    username: 'sofia.pets',
    avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
    bio: 'Mamá de Luna y Rocky 🐾 Amante de los paseos al atardecer y las siestas con peludos.',
    location: 'Ciudad de México',
    petIds: ['p1', 'p3'],
  },
  {
    id: 'u1',
    name: 'Diego Torres',
    username: 'diego.canino',
    avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
    bio: 'Entrenador canino 🦴 Compartiendo la vida de Michi y Bruno.',
    location: 'Guadalajara',
    petIds: ['p2', 'p12'],
  },
  {
    id: 'u2',
    name: 'Valentina Cruz',
    username: 'vale.bunny',
    avatar: 'https://randomuser.me/api/portraits/women/68.jpg',
    bio: 'Nube es mi mundo 🐰 Fotografía de mascotas y mucho amor.',
    location: 'Bogotá',
    petIds: ['p4'],
  },
  {
    id: 'u3',
    name: 'Mateo Herrera',
    username: 'mateo.wild',
    avatar: 'https://randomuser.me/api/portraits/men/75.jpg',
    bio: 'Kiwi habla más que yo 🦜 y Chispa corre más rápido.',
    location: 'Buenos Aires',
    petIds: ['p5', 'p14'],
  },
  {
    id: 'u4',
    name: 'Camila Rojas',
    username: 'cami.gatuna',
    avatar: 'https://randomuser.me/api/portraits/women/12.jpg',
    bio: 'Simba es el rey de la casa 🦁 Adopta, no compres.',
    location: 'Lima',
    petIds: ['p6'],
  },
  {
    id: 'u5',
    name: 'Andrés Molina',
    username: 'andres.labs',
    avatar: 'https://randomuser.me/api/portraits/men/22.jpg',
    bio: 'Max y Olivia: el dúo más caótico y adorable que conozco 🐕🐈',
    location: 'Medellín',
    petIds: ['p7', 'p13'],
  },
  {
    id: 'u6',
    name: 'Lucía Fernández',
    username: 'lucia.poodle',
    avatar: 'https://randomuser.me/api/portraits/women/33.jpg',
    bio: 'Coco tiene mejor peinado que yo ✂️🐩 Groomer profesional.',
    location: 'Santiago',
    petIds: ['p8'],
  },
  {
    id: 'u7',
    name: 'Pablo Vega',
    username: 'pablo.mini',
    avatar: 'https://randomuser.me/api/portraits/men/45.jpg',
    bio: 'Pelusa: 40 gramos de pura energía 🐹',
    location: 'Montevideo',
    petIds: ['p9'],
  },
  {
    id: 'u8',
    name: 'Isabella Núñez',
    username: 'isa.beagle',
    avatar: 'https://randomuser.me/api/portraits/women/56.jpg',
    bio: 'Toby huele todo, ama todo 🐶 Veterinaria en formación.',
    location: 'Quito',
    petIds: ['p10'],
  },
  {
    id: 'u9',
    name: 'Javier Soto',
    username: 'javi.persa',
    avatar: 'https://randomuser.me/api/portraits/men/64.jpg',
    bio: 'Mia duerme 20 horas y aún así me ignora 😻',
    location: 'Madrid',
    petIds: ['p11'],
  },
];

// ---------- Pets ----------
export const PETS: Pet[] = [
  { id: 'p1', name: 'Luna', species: 'perro', breed: 'Golden Retriever', age: '3 años', bio: 'Experta en atrapar pelotas y robar corazones 🎾💛', emoji: '🐕', ownerId: 'u0', followers: 12840, following: 312, avatarSeed: 11 },
  { id: 'p2', name: 'Michi', species: 'gato', breed: 'Siamés', age: '2 años', bio: 'Juez supremo de la casa. Acepto tributos en atún 🐟', emoji: '🐱', ownerId: 'u1', followers: 8930, following: 145, avatarSeed: 22 },
  { id: 'p3', name: 'Rocky', species: 'perro', breed: 'Bulldog Francés', age: '4 años', bio: 'Ronco cuando duermo y también cuando estoy despierto 😤', emoji: '🐶', ownerId: 'u0', followers: 6540, following: 98, avatarSeed: 33 },
  { id: 'p4', name: 'Nube', species: 'conejo', breed: 'Holandés enano', age: '1 año', bio: 'Saltarina profesional. Las zanahorias son vida 🥕', emoji: '🐰', ownerId: 'u2', followers: 4210, following: 67, avatarSeed: 44 },
  { id: 'p5', name: 'Kiwi', species: 'loro', breed: 'Guacamayo', age: '5 años', bio: 'Sé decir 47 palabras y ninguna es "silencio" 🗣️', emoji: '🦜', ownerId: 'u3', followers: 15600, following: 203, avatarSeed: 55 },
  { id: 'p6', name: 'Simba', species: 'gato', breed: 'Atigrado naranja', age: '3 años', bio: 'El rey león de departamento. Rugido nivel: miau 🦁', emoji: '🐈', ownerId: 'u4', followers: 9870, following: 156, avatarSeed: 66 },
  { id: 'p7', name: 'Max', species: 'perro', breed: 'Labrador', age: '5 años', bio: 'Buen chico certificado ⭐ Nadador olímpico de piscinas inflables', emoji: '🐕', ownerId: 'u5', followers: 11200, following: 289, avatarSeed: 77 },
  { id: 'p8', name: 'Coco', species: 'perro', breed: 'Poodle', age: '2 años', bio: 'Mi peinado cuesta más que tu café ✨🐩', emoji: '🐩', ownerId: 'u6', followers: 7650, following: 134, avatarSeed: 88 },
  { id: 'p9', name: 'Pelusa', species: 'hámster', breed: 'Sirio dorado', age: '8 meses', bio: 'Corro 5km cada noche en mi rueda. Atleta de élite 🏃', emoji: '🐹', ownerId: 'u7', followers: 3420, following: 45, avatarSeed: 99 },
  { id: 'p10', name: 'Toby', species: 'perro', breed: 'Beagle', age: '6 años', bio: 'Detective de olores. Ningún snack está a salvo 🔍', emoji: '🐶', ownerId: 'u8', followers: 5890, following: 178, avatarSeed: 110 },
  { id: 'p11', name: 'Mia', species: 'gato', breed: 'Persa', age: '4 años', bio: 'Elegancia, pelo y desdén en partes iguales 👑', emoji: '🐈‍⬛', ownerId: 'u9', followers: 13450, following: 92, avatarSeed: 121 },
  { id: 'p12', name: 'Bruno', species: 'perro', breed: 'Pastor Alemán', age: '4 años', bio: 'Guardián del hogar y de las galletas 🍪🛡️', emoji: '🦮', ownerId: 'u1', followers: 10300, following: 211, avatarSeed: 132 },
  { id: 'p13', name: 'Olivia', species: 'gato', breed: 'Bengalí', age: '2 años', bio: 'Mitad gata, mitad leopardo, 100% caos 🐆', emoji: '🐱', ownerId: 'u5', followers: 8120, following: 167, avatarSeed: 143 },
  { id: 'p14', name: 'Chispa', species: 'perro', breed: 'Corgi', age: '1 año', bio: 'Patas cortas, sueños grandes 🚀', emoji: '🐕', ownerId: 'u3', followers: 18900, following: 340, avatarSeed: 154 },
];

export const getUser = (id: string) => USERS.find((u) => u.id === id)!;
export const getPet = (id: string) => PETS.find((p) => p.id === id)!;
export const getOwner = (pet: Pet) => getUser(pet.ownerId);

// ---------- Content pools ----------
const CAPTIONS: Record<Species, string[]> = {
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

const COMMENT_POOL = [
  '¡Qué hermosura! 😍',
  'No puedo con tanta ternura 🥺',
  'Jajaja me encanta 😂',
  '¡Necesito conocerlo en persona!',
  'Es idéntico al mío 🐾',
  '10/10 buen chico ⭐',
  'Esa carita lo es todo ❤️',
  '¿Cómo logras que pose así? 📸',
  'Mándale muchos mimos de mi parte 🤗',
  'La foto más linda que vi hoy ✨',
  'Definitivamente mi cuenta favorita 💯',
  '¡Saludos desde Argentina! 🇦🇷',
  'Se parece a una nube ☁️',
  'Etiqueta: adorable nivel máximo 🚨',
];

const NOTIF_TEXTS = {
  like: 'le dio me gusta a tu publicación',
  follow: 'empezó a seguir a',
  comment: 'comentó: "¡Qué hermosura! 😍"',
  mention: 'te mencionó en un comentario',
};

// ---------- Generators ----------
export function makePost(id: string, seed: number, forcePet?: Pet): Post {
  const rng = mulberry32(seed * 7919 + 4231);
  const pet = forcePet ?? PETS[Math.floor(rng() * PETS.length)];
  const captions = CAPTIONS[pet.species];
  const caption = captions[Math.floor(rng() * captions.length)];
  const imgSeed = Math.floor(rng() * 900) + seed;
  const nComments = Math.floor(rng() * 4);
  const comments: Comment[] = [];
  for (let c = 0; c < nComments; c++) {
    const u = USERS[Math.floor(rng() * USERS.length)];
    comments.push({
      id: `${id}-c${c}`,
      userId: u.id,
      text: COMMENT_POOL[Math.floor(rng() * COMMENT_POOL.length)],
      minutesAgo: Math.floor(rng() * 500) + 5,
    });
  }
  return {
    id,
    petId: pet.id,
    image: petImage(pet.species, imgSeed),
    imageWidth: 600,
    imageHeight: 600,
    caption,
    likes: 40 + Math.floor(rng() * 4200),
    minutesAgo: 12 + Math.floor(seed * 38 + rng() * 30),
    comments,
  };
}

export function generateFeedPage(page: number, pageSize = 6): Post[] {
  const posts: Post[] = [];
  for (let i = 0; i < pageSize; i++) {
    const idx = page * pageSize + i;
    posts.push(makePost(`feed-${idx}`, idx));
  }
  return posts;
}

export function generateExplorePage(page: number, pageSize = 15): Post[] {
  const posts: Post[] = [];
  for (let i = 0; i < pageSize; i++) {
    const idx = page * pageSize + i;
    posts.push(makePost(`explore-${idx}`, idx + 50000));
  }
  return posts;
}

export function generatePetPosts(petId: string): Post[] {
  const pet = getPet(petId);
  const base = hashStr(petId) % 10000;
  const rng = mulberry32(base);
  const count = 9 + Math.floor(rng() * 7);
  const posts: Post[] = [];
  for (let i = 0; i < count; i++) {
    posts.push(makePost(`pet-${petId}-${i}`, base + i * 17, pet));
  }
  return posts;
}

export function generateUserPosts(userId: string): Post[] {
  const user = getUser(userId);
  const all: Post[] = [];
  user.petIds.forEach((pid) => {
    all.push(...generatePetPosts(pid));
  });
  // interleave deterministically
  const rng = mulberry32(hashStr(userId));
  return all.sort(() => rng() - 0.5);
}

export function generateNotifications(): Notification[] {
  const rng = mulberry32(777);
  const notifs: Notification[] = [];
  const types: Notification['type'][] = ['like', 'follow', 'comment', 'like', 'mention', 'follow', 'comment', 'like'];
  for (let i = 0; i < 18; i++) {
    const type = types[Math.floor(rng() * types.length)];
    const user = USERS[1 + Math.floor(rng() * (USERS.length - 1))];
    const myPets = getUser(CURRENT_USER_ID).petIds;
    const pet = getPet(myPets[Math.floor(rng() * myPets.length)]);
    const withImage = type !== 'follow';
    notifs.push({
      id: `n${i}`,
      type,
      userId: user.id,
      petId: pet.id,
      text:
        type === 'follow'
          ? `${NOTIF_TEXTS.follow} ${pet.name}`
          : NOTIF_TEXTS[type],
      minutesAgo: 5 + Math.floor(i * 55 + rng() * 40),
      image: withImage ? petImage(pet.species, 300 + i * 13) : undefined,
    });
  }
  return notifs;
}

// ---------- Helpers ----------
export function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)} M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)} mil`;
  return String(n);
}

export function formatTime(minutesAgo: number): string {
  if (minutesAgo < 1) return 'ahora';
  if (minutesAgo < 60) return `hace ${Math.floor(minutesAgo)} min`;
  const hours = Math.floor(minutesAgo / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} d`;
  return `hace ${Math.floor(days / 7)} sem`;
}

export const SPECIES_LABEL: Record<Species, string> = {
  perro: 'Perro',
  gato: 'Gato',
  conejo: 'Conejo',
  loro: 'Loro',
  hámster: 'Hámster',
};

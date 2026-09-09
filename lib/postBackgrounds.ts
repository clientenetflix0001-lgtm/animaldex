// Catálogo oficial de fondos para publicaciones de solo texto.
// Cada publicación guarda únicamente `backgroundId` (un string).
// El mismo id se reutiliza en millones de posts: no hay copia ni raster
// de fondo por publicación.
//
// IDs permanentes: nunca reciclar. Un fondo que se retire queda
// `active: false` para no aparecer en el selector, pero sigue
// resolviéndose al leer posts antiguos.
//
// Resolución futura de un catálogo remoto: ampliar `resolvePostBackground`
// (p. ej. fusionar JSON cacheado). Los posts existentes no cambian.

export const POST_CAPTION_MAX = 1000;
export const POST_BACKGROUND_CARD_HEIGHT = 350;
export const DEFAULT_POST_BACKGROUND_ID = 'orange-gradient-01';

export type PostBackgroundType = 'solid' | 'gradient' | 'image';

export interface PostBackground {
  id: string;
  type: PostBackgroundType;
  /** solid: 1 color; gradient: 2+ colores. */
  colors: readonly [string, ...string[]];
  textColor: string;
  /** URL única (Cloudflare) reutilizada por todos los posts con este id. */
  imageUrl?: string;
  /** Preview OG. Si falta, el worker usa la imagen genérica de Animaldex. */
  ogImageUrl?: string;
  active: boolean;
  pattern?: 'paws';
}

export const POST_BACKGROUNDS: readonly PostBackground[] = [
  {
    id: 'orange-gradient-01',
    type: 'gradient',
    colors: ['#FF6B4A', '#FFB347'],
    textColor: '#FFFFFF',
    active: true,
  },
  {
    id: 'pink-gradient-01',
    type: 'gradient',
    colors: ['#FF5D8F', '#C44569'],
    textColor: '#FFFFFF',
    active: true,
  },
  {
    id: 'blue-gradient-01',
    type: 'gradient',
    colors: ['#4A90D9', '#1B4F8A'],
    textColor: '#FFFFFF',
    active: true,
  },
  {
    id: 'teal-gradient-01',
    type: 'gradient',
    colors: ['#2EC4B6', '#0B7A70'],
    textColor: '#FFFFFF',
    active: true,
  },
  {
    id: 'sunset-gradient-01',
    type: 'gradient',
    colors: ['#FF6B4A', '#9B59B6'],
    textColor: '#FFFFFF',
    active: true,
  },
  {
    id: 'purple-gradient-01',
    type: 'gradient',
    colors: ['#7B4B9A', '#2C1B3D'],
    textColor: '#FFFFFF',
    active: true,
  },
  {
    id: 'forest-gradient-01',
    type: 'gradient',
    colors: ['#1B5E20', '#66BB6A'],
    textColor: '#FFFFFF',
    active: true,
  },
  {
    id: 'night-gradient-01',
    type: 'gradient',
    colors: ['#1A1A2E', '#16213E'],
    textColor: '#FFFFFF',
    active: true,
  },
  {
    id: 'solid-coral-01',
    type: 'solid',
    colors: ['#FF6B4A'],
    textColor: '#FFFFFF',
    active: true,
  },
  {
    id: 'solid-teal-01',
    type: 'solid',
    colors: ['#2EC4B6'],
    textColor: '#FFFFFF',
    active: true,
  },
  {
    id: 'solid-navy-01',
    type: 'solid',
    colors: ['#1B3A4B'],
    textColor: '#FFFFFF',
    active: true,
  },
  {
    id: 'animaldex-paws-01',
    type: 'gradient',
    colors: ['#3A2A1A', '#FF6B4A'],
    textColor: '#FFFFFF',
    active: true,
    pattern: 'paws',
  },
];

const BY_ID: Record<string, PostBackground> = Object.fromEntries(
  POST_BACKGROUNDS.map((bg) => [bg.id, bg])
);

export const POST_BACKGROUND_IDS: ReadonlySet<string> = new Set(POST_BACKGROUNDS.map((bg) => bg.id));

const FALLBACK_BACKGROUND: PostBackground = {
  id: 'orange-gradient-01',
  type: 'solid',
  colors: ['#FF6B4A'],
  textColor: '#FFFFFF',
  active: false,
};

export function getActivePostBackgrounds(): PostBackground[] {
  return POST_BACKGROUNDS.filter((bg) => bg.active);
}

export function isAllowedBackgroundId(id: string | null | undefined): boolean {
  return !!id && POST_BACKGROUND_IDS.has(id);
}

/** Resuelve un id conocido. Ids futuros/remotos desconocidos usan un sólido de fallback. */
export function resolvePostBackground(id: string | null | undefined): PostBackground {
  if (id && BY_ID[id]) return BY_ID[id];
  return FALLBACK_BACKGROUND;
}

export function isTextBackgroundPost(post: {
  image?: string | null;
  backgroundId?: string | null;
}): boolean {
  return !post.image && !!post.backgroundId;
}

export function backgroundCardFontSize(length: number): number {
  if (length <= 80) return 28;
  if (length <= 180) return 24;
  if (length <= 350) return 20;
  if (length <= 500) return 18;
  if (length <= 700) return 16;
  return 15;
}

const CARD_PAD = 28;
const SEE_MORE_RESERVE = 36;
const LINE_HEIGHT_RATIO = 1.32;
const TEXT_AREA_WIDTH = 300;

export function backgroundCardMaxLines(
  textLength: number,
  reserveSeeMore: boolean,
  cardHeight: number = POST_BACKGROUND_CARD_HEIGHT
): number {
  const fontSize = backgroundCardFontSize(textLength);
  const available = cardHeight - CARD_PAD * 2 - (reserveSeeMore ? SEE_MORE_RESERVE : 0);
  return Math.max(2, Math.floor(available / (fontSize * LINE_HEIGHT_RATIO)));
}

export function backgroundTextNeedsSeeMore(
  text: string,
  cardHeight: number = POST_BACKGROUND_CARD_HEIGHT
): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const maxLines = backgroundCardMaxLines(trimmed.length, true, cardHeight);
  const fontSize = backgroundCardFontSize(trimmed.length);
  const charsPerLine = Math.max(10, Math.floor(TEXT_AREA_WIDTH / (fontSize * 0.52)));
  let lines = 0;
  for (const para of trimmed.split('\n')) {
    lines += Math.max(1, Math.ceil((para.length || 1) / charsPerLine));
    if (lines > maxLines) return true;
  }
  return false;
}

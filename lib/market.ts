// ============================================================
// Animaldex — Mercado (productos y servicios)
// ============================================================
// Constantes y helpers compartidos por las pantallas de Mercado.
// "Patitas" es la unidad de valor interna de Animaldex: por ahora
// solo se MUESTRA el precio (sin billetera/pagos reales todavía),
// pero la estructura ya está lista para conectar esa lógica después.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ListingKind = 'product' | 'service';

// ---------- Localidad seleccionada para Mercado ----------
// Misma lógica que Alertas (GPS → localidad, editable manualmente,
// sin tocar la ubicación real del dispositivo), pero con su propia
// clave de persistencia para no mezclarse con el filtro de Alertas.
export interface MarketLocality {
  locality: string;
  province: string | null;
  lat?: number | null;
  lon?: number | null;
}

const MARKET_LOCALITY_KEY = 'animaldex-market-locality';

export async function saveMarketLocality(entry: MarketLocality): Promise<void> {
  try {
    await AsyncStorage.setItem(MARKET_LOCALITY_KEY, JSON.stringify(entry));
  } catch {}
}

export async function loadSavedMarketLocality(): Promise<MarketLocality | null> {
  try {
    const raw = await AsyncStorage.getItem(MARKET_LOCALITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.locality === 'string' && parsed.locality) return parsed;
    return null;
  } catch {
    return null;
  }
}

export interface MarketCategory {
  id: string;
  label: string;
  emoji: string;
  appliesTo: ListingKind | 'both';
}

// Lista curada y ESCALABLE (misma filosofía que lib/localities.ts):
// se puede seguir agregando categorías sin tocar otro archivo.
export const MARKET_CATEGORIES: MarketCategory[] = [
  { id: 'perros', label: 'Perros', emoji: '🐶', appliesTo: 'both' },
  { id: 'gatos', label: 'Gatos', emoji: '🐱', appliesTo: 'both' },
  { id: 'alimentos', label: 'Alimentos', emoji: '🍖', appliesTo: 'product' },
  { id: 'juguetes', label: 'Juguetes', emoji: '🧸', appliesTo: 'product' },
  { id: 'camas', label: 'Camas', emoji: '🛏️', appliesTo: 'product' },
  { id: 'accesorios', label: 'Accesorios', emoji: '🦮', appliesTo: 'product' },
  { id: 'higiene', label: 'Higiene', emoji: '🧴', appliesTo: 'product' },
  { id: 'salud', label: 'Salud', emoji: '💊', appliesTo: 'product' },
  { id: 'peluqueria', label: 'Peluquería', emoji: '✂️', appliesTo: 'service' },
  { id: 'veterinaria', label: 'Veterinaria', emoji: '🩺', appliesTo: 'service' },
  { id: 'paseadores', label: 'Paseadores', emoji: '🚶', appliesTo: 'service' },
  { id: 'adiestramiento', label: 'Adiestramiento', emoji: '🎓', appliesTo: 'service' },
  { id: 'guarderia', label: 'Guardería', emoji: '🏠', appliesTo: 'service' },
  { id: 'transporte', label: 'Transporte', emoji: '🚗', appliesTo: 'service' },
  { id: 'fotografia', label: 'Fotografía', emoji: '📸', appliesTo: 'service' },
  { id: 'otros', label: 'Otros', emoji: '🐾', appliesTo: 'both' },
];

export function categoriesFor(kind: ListingKind): MarketCategory[] {
  return MARKET_CATEGORIES.filter((c) => c.appliesTo === kind || c.appliesTo === 'both');
}

export function categoryLabel(id: string): string {
  return MARKET_CATEGORIES.find((c) => c.id === id)?.label ?? 'Otros';
}

export function categoryEmoji(id: string): string {
  return MARKET_CATEGORIES.find((c) => c.id === id)?.emoji ?? '🐾';
}

// ---------- Entrega / modalidad ----------

export const DELIVERY_OPTIONS: { id: string; label: string; icon: string }[] = [
  { id: 'pickup', label: 'Retiro en el local/domicilio', icon: 'walk-outline' },
  { id: 'delivery', label: 'Envío a domicilio', icon: 'bicycle-outline' },
  { id: 'both', label: 'Ambas opciones', icon: 'swap-horizontal-outline' },
];

export const MODALITY_OPTIONS: { id: string; label: string; icon: string }[] = [
  { id: 'presencial', label: 'Presencial', icon: 'storefront-outline' },
  { id: 'domicilio', label: 'A domicilio', icon: 'home-outline' },
  { id: 'online', label: 'Online', icon: 'videocam-outline' },
];

export function deliveryLabel(id: string | null): string {
  return DELIVERY_OPTIONS.find((d) => d.id === id)?.label ?? '';
}

export function modalityLabel(id: string | null): string {
  return MODALITY_OPTIONS.find((m) => m.id === id)?.label ?? '';
}

// ---------- Patitas (unidad de valor interna) ----------

export function formatPatitas(n: number): string {
  return `🐾 ${n.toLocaleString('es-AR')} Patitas`;
}

export function formatArs(n: number): string {
  return `$${n.toLocaleString('es-AR')}`;
}

// ---------- Secciones del home de Mercado ----------

export type MarketSection = 'featured' | 'nearby' | 'top_rated' | 'recent';

export const MARKET_SECTIONS: { id: MarketSection; label: string; emoji: string }[] = [
  { id: 'featured', label: 'Destacados', emoji: '🔥' },
  { id: 'nearby', label: 'Cerca de vos', emoji: '📍' },
  { id: 'top_rated', label: 'Mejor valorados', emoji: '⭐' },
  { id: 'recent', label: 'Recién publicados', emoji: '🆕' },
];

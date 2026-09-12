import {
  type AlertType,
  parseAlertType,
  speciesLabel,
  timestampToDateString,
} from './alerts.ts';
import type { ApiAlert } from './db.ts';
import { isValidPetUsername } from './petHandles.ts';
import { publicWebUrl } from './publicWeb.ts';

export const FLYER_ASPECT = 9 / 16;
export const FLYER_EXPORT_WIDTH = 1080;
export const FLYER_EXPORT_HEIGHT = 1920;
export const FLYER_FALLBACK_WIDTH = 900;
export const FLYER_FALLBACK_HEIGHT = 1600;

export type AlertFlyerSource = 'existing' | 'draft';

export interface AlertFlyer {
  type: AlertType;
  headline: string;
  cta: string;
  accent: string;
  locationLabel: string;
  image?: string;
  petName?: string;
  speciesLabel?: string;
  sexLabel?: string;
  ageLabel?: string;
  sizeLabel?: string;
  breed?: string;
  colorLabel?: string;
  location?: string;
  dateLabel?: string;
  description?: string;
  contact?: string;
  authorName?: string;
  petPublicUrl?: string;
}

export interface AlertFlyerFactRow {
  icon: string;
  label: string;
  value: string;
}

export interface AlertFlyerPublishPayload {
  type: AlertType;
  petName?: string;
  species: string;
  description: string;
  image: string;
  locality: string;
  province?: string;
  lat?: number | null;
  lon?: number | null;
  eventDate?: number;
  sex?: 'macho' | 'hembra' | null;
  breed?: string;
  authorProfileId?: string | null;
  contactWhatsapp?: string | null;
  contactPhone?: string | null;
}

export interface AlertFlyerSession {
  source: AlertFlyerSource;
  alertId?: string;
  petId?: string;
  petUsername?: string;
  flyer: AlertFlyer;
  publish?: AlertFlyerPublishPayload;
}

const FLYER_HERO: Record<AlertType, string> = {
  lost: '¡SE BUSCA!',
  sighting: 'MASCOTA AVISTADA',
  found: 'MASCOTA ENCONTRADA',
  adoption: 'BUSCA UN HOGAR',
};

const FLYER_CTA: Record<AlertType, string> = {
  lost: 'AYUDANOS A ENCONTRARLA',
  sighting: '¿LA RECONOCÉS?',
  found: 'AYUDANOS A REUNIRLA CON SU FAMILIA',
  adoption: 'AYUDALA A ENCONTRAR UNA FAMILIA',
};

const FLYER_ACCENT: Record<AlertType, string> = {
  lost: '#D97A68',
  sighting: '#4E9C9A',
  found: '#6BAF7C',
  adoption: '#A78BB8',
};

const FLYER_LOCATION_LABEL: Record<AlertType, string> = {
  lost: 'Última ubicación',
  sighting: 'Lugar del avistamiento',
  found: 'Lugar donde fue encontrada',
  adoption: 'Ubicación',
};

function present(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  return text ? text : undefined;
}

function sexLabel(sex?: string | null): string | undefined {
  if (sex === 'macho') return 'Macho';
  if (sex === 'hembra') return 'Hembra';
  return undefined;
}

function locationLine(locality?: string | null, province?: string | null): string | undefined {
  const parts = [present(locality), present(province)].filter(Boolean) as string[];
  return parts.length ? parts.join(', ') : undefined;
}

function dateLabel(ts?: number | null): string | undefined {
  if (!ts || !Number.isFinite(ts)) return undefined;
  return timestampToDateString(ts);
}

function contactLine(whatsapp?: string | null, phone?: string | null): string | undefined {
  const wa = present(whatsapp);
  const tel = present(phone);
  if (wa && tel && wa !== tel) return `${wa} · ${tel}`;
  return wa || tel;
}

export function flyerHeadlineForType(type: AlertType): string {
  return FLYER_HERO[type];
}

export function flyerCtaForType(type: AlertType, sex?: string | null): string {
  if (type === 'lost') {
    if (sex === 'macho') return 'AYUDANOS A ENCONTRARLO';
    if (sex === 'hembra') return 'AYUDANOS A ENCONTRARLA';
  }
  return FLYER_CTA[type];
}

export function flyerAccentForType(type: AlertType): string {
  return FLYER_ACCENT[type];
}

export function flyerLocationLabelForType(type: AlertType): string {
  return FLYER_LOCATION_LABEL[type];
}

export function finiteCoord(value?: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** URL canónica `https://animaldex.com/nina.pet`. No inventa `/pet/:id`. */
export function flyerPetPublicUrl(username?: string | null): string | undefined {
  const handle = String(username ?? '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase();
  if (!isValidPetUsername(handle)) return undefined;
  return publicWebUrl(`/${handle}`);
}

export function buildAlertFlyerData(input: {
  type?: string | null;
  image?: string | null;
  petName?: string | null;
  species?: string | null;
  sex?: string | null;
  age?: string | null;
  size?: string | null;
  breed?: string | null;
  color?: string | null;
  locality?: string | null;
  province?: string | null;
  eventDate?: number | null;
  createdAt?: number | null;
  description?: string | null;
  contactWhatsapp?: string | null;
  contactPhone?: string | null;
  userName?: string | null;
  petUsername?: string | null;
}): AlertFlyer {
  const type = parseAlertType(input.type) || 'lost';
  return {
    type,
    headline: flyerHeadlineForType(type),
    cta: flyerCtaForType(type, input.sex),
    accent: FLYER_ACCENT[type],
    locationLabel: FLYER_LOCATION_LABEL[type],
    image: present(input.image),
    petName: present(input.petName),
    speciesLabel: present(input.species) ? speciesLabel(input.species!) : undefined,
    sexLabel: sexLabel(input.sex),
    ageLabel: present(input.age),
    sizeLabel: present(input.size),
    breed: present(input.breed),
    colorLabel: present(input.color),
    location: locationLine(input.locality, input.province),
    dateLabel: dateLabel(input.eventDate) || dateLabel(input.createdAt),
    description: present(input.description),
    contact: contactLine(input.contactWhatsapp, input.contactPhone),
    authorName: present(input.userName),
    petPublicUrl: flyerPetPublicUrl(input.petUsername),
  };
}

export function flyerFromApiAlert(alert: ApiAlert): AlertFlyer {
  return buildAlertFlyerData({
    type: alert.type,
    image: alert.image,
    petName: alert.petName,
    species: alert.species,
    sex: alert.sex,
    breed: alert.breed,
    locality: alert.locality,
    province: alert.province,
    eventDate: alert.eventDate,
    createdAt: alert.createdAt,
    description: alert.description,
    userName: alert.userName,
  });
}

export function visibleFlyerFacts(flyer: AlertFlyer): string[] {
  return flyerFactRows(flyer).map((row) => row.value);
}

export function flyerFactRows(flyer: AlertFlyer): AlertFlyerFactRow[] {
  const rows: AlertFlyerFactRow[] = [];
  if (flyer.speciesLabel) rows.push({ icon: '🐾', label: 'Especie', value: flyer.speciesLabel });
  if (flyer.breed) rows.push({ icon: '🐕', label: 'Raza', value: flyer.breed });
  if (flyer.sexLabel) {
    rows.push({
      icon: flyer.sexLabel === 'Hembra' ? '♀' : '♂',
      label: 'Sexo',
      value: flyer.sexLabel,
    });
  }
  if (flyer.colorLabel) rows.push({ icon: '🎨', label: 'Color', value: flyer.colorLabel });
  if (flyer.ageLabel) rows.push({ icon: '⏳', label: 'Edad', value: flyer.ageLabel });
  if (flyer.sizeLabel) rows.push({ icon: '📏', label: 'Tamaño', value: flyer.sizeLabel });
  return rows;
}

/** Hechos existentes unidos: `Perro · Hembra · …`. Omite vacíos. */
export function flyerMetaLine(flyer: AlertFlyer): string | undefined {
  const parts = flyerFactRows(flyer).map((row) => row.value);
  return parts.length ? parts.join(' · ') : undefined;
}

export type FlyerContentDensity = 'normal' | 'compact';

export const FLYER_PHOTO_HEIGHT_NORMAL = '44%';
export const FLYER_PHOTO_HEIGHT_COMPACT = '40%';
export const FLYER_PHOTO_WIDTH = '92%';

export function flyerContentDensity(flyer: AlertFlyer): FlyerContentDensity {
  const facts = flyerFactRows(flyer).length;
  const description = flyer.description || '';
  const extraBlocks = [flyer.location, flyer.dateLabel, flyer.contact, flyer.petPublicUrl].filter(Boolean).length;
  if (description.length > 90 || facts >= 4 || extraBlocks >= 4) return 'compact';
  return 'normal';
}

export function flyerDescriptionLines(density: FlyerContentDensity): number {
  return density === 'compact' ? 2 : 3;
}

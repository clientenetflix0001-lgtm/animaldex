import {
  ALERT_TYPES,
  type AlertType,
  parseAlertType,
  speciesLabel,
  timestampToDateString,
} from './alerts.ts';
import type { ApiAlert } from './db.ts';

export const FLYER_ASPECT = 4 / 5;
export const FLYER_EXPORT_WIDTH = 1080;
export const FLYER_EXPORT_HEIGHT = 1350;

export type AlertFlyerSource = 'existing' | 'draft';

export interface AlertFlyer {
  type: AlertType;
  headline: string;
  cta: string;
  accent: string;
  image?: string;
  petName?: string;
  speciesLabel?: string;
  sexLabel?: string;
  ageLabel?: string;
  sizeLabel?: string;
  breed?: string;
  location?: string;
  dateLabel?: string;
  description?: string;
  contact?: string;
  authorName?: string;
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
  authorProfileId?: string | null;
  contactWhatsapp?: string | null;
  contactPhone?: string | null;
}

export interface AlertFlyerSession {
  source: AlertFlyerSource;
  alertId?: string;
  flyer: AlertFlyer;
  publish?: AlertFlyerPublishPayload;
}

const FLYER_CTA: Record<AlertType, string> = {
  lost: 'AYUDANOS A ENCONTRARLA',
  sighting: '¿LA RECONOCÉS?',
  found: 'AYUDANOS A REUNIRLA CON SU FAMILIA',
  adoption: 'BUSCA UN HOGAR',
};

const FLYER_ACCENT: Record<AlertType, string> = {
  lost: '#D97A68',
  sighting: '#6BAF7C',
  found: '#6BAF7C',
  adoption: '#A78BB8',
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

function speciesSexFact(species?: string | null, sex?: string | null): string | undefined {
  const id = String(species || '').trim().toLowerCase();
  if (id === 'perro' && sex === 'hembra') return 'Perra';
  if (id === 'perro' && sex === 'macho') return 'Perro';
  if (id === 'gato' && sex === 'hembra') return 'Gata';
  if (id === 'gato' && sex === 'macho') return 'Gato';
  const spec = present(species) ? speciesLabel(species!) : undefined;
  const sexText = sexLabel(sex);
  if (spec && sexText) return `${spec} · ${sexText}`;
  return spec || sexText;
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
  const cfg = ALERT_TYPES[type];
  return `${cfg.emoji} ${cfg.label}`;
}

export function flyerCtaForType(type: AlertType, sex?: string | null): string {
  if (type === 'lost') {
    if (sex === 'macho') return 'AYUDANOS A ENCONTRARLO';
    if (sex === 'hembra') return 'AYUDANOS A ENCONTRARLA';
  }
  return FLYER_CTA[type];
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
  locality?: string | null;
  province?: string | null;
  eventDate?: number | null;
  createdAt?: number | null;
  description?: string | null;
  contactWhatsapp?: string | null;
  contactPhone?: string | null;
  userName?: string | null;
}): AlertFlyer {
  const type = parseAlertType(input.type) || 'lost';
  return {
    type,
    headline: flyerHeadlineForType(type),
    cta: flyerCtaForType(type, input.sex),
    accent: FLYER_ACCENT[type],
    image: present(input.image),
    petName: present(input.petName),
    speciesLabel: speciesSexFact(input.species, input.sex),
    sexLabel: undefined,
    ageLabel: present(input.age),
    sizeLabel: present(input.size),
    breed: present(input.breed),
    location: locationLine(input.locality, input.province),
    dateLabel: dateLabel(input.eventDate) || dateLabel(input.createdAt),
    description: present(input.description),
    contact: contactLine(input.contactWhatsapp, input.contactPhone),
    authorName: present(input.userName),
  };
}

export function flyerFromApiAlert(alert: ApiAlert): AlertFlyer {
  return buildAlertFlyerData(alert);
}

export function visibleFlyerFacts(flyer: AlertFlyer): string[] {
  return [flyer.speciesLabel, flyer.ageLabel, flyer.sizeLabel, flyer.breed].filter(Boolean) as string[];
}

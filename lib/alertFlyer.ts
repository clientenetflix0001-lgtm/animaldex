import {
  ALERT_TYPES,
  type AlertType,
  parseAlertType,
  speciesLabel,
  timestampToDateString,
} from './alerts.ts';
import type { ApiAlert } from './db.ts';

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
  lost: '#E8A090',
  sighting: '#8BB8B0',
  found: '#8BB8B0',
  adoption: '#D4A5B0',
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
  return ALERT_TYPES[type].label;
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
    speciesLabel: present(input.species) ? speciesLabel(input.species!) : undefined,
    sexLabel: sexLabel(input.sex),
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
  return [flyer.speciesLabel, flyer.sexLabel, flyer.breed].filter(Boolean) as string[];
}

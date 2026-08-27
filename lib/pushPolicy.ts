/**
 * Lógica de Push Animaldex (Expo Push Service).
 * El Worker envía a exp.host; el cliente solo registra SU token.
 * Sin coordenadas, teléfono ni email en el payload visible.
 */

export const EXPO_PUSH_SEND_URL = 'https://exp.host/--/api/v2/push/send';
export const EXPO_PUSH_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
export const EXPO_PUSH_BATCH_MAX = 100;
export const EXPO_PROJECT_ID = 'f2b4eacd-6e1a-4dbc-89cd-b65598756451';

export const PUSH_CHANNEL_PETS = 'mascotas';
export const PUSH_CHANNEL_PETS_URGENT = 'mascotas-urgentes';
export const PUSH_CHANNEL_REMINDERS = 'recordatorios';
export const LOCATION_ACTIVITY_SUBTITLE = 'Tocá para ver la ubicación.';

export function displayPersonName(user: { name?: string | null; username?: string | null } | null | undefined): string | null {
  const name = String(user?.name || '').trim();
  if (name) return name;
  const username = String(user?.username || '').trim();
  return username || null;
}

export function locationActivityCopy(petName: string, actorName?: string | null): { title: string; subtitle: string } {
  const pet = String(petName || '').trim() || 'tu mascota';
  if (actorName) {
    return {
      title: `${actorName} te envió la ubicación de ${pet}.`,
      subtitle: LOCATION_ACTIVITY_SUBTITLE,
    };
  }
  return {
    title: `Un invitado te envió la ubicación de ${pet}.`,
    subtitle: LOCATION_ACTIVITY_SUBTITLE,
  };
}

export const DEFAULT_NOTIFICATION_PREFS = {
  location: true,
  birthday: true,
  lost_pet: true,
  adoption: true,
  comment: true,
  like: false,
} as const;

export type NotificationPrefKey = keyof typeof DEFAULT_NOTIFICATION_PREFS;

export type PushTokenRow = {
  id: string;
  userId: string;
  expoPushToken: string;
  platform: string;
  deviceId: string | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  lastSeenAt: number;
};

const EXPO_TOKEN_RE = /^ExponentPushToken\[[A-Za-z0-9_-]+\]$/;

export function isExpoPushToken(value: string | null | undefined): boolean {
  return EXPO_TOKEN_RE.test(String(value || '').trim());
}

export function locationPushIdempotencyKey(shareId: string): string {
  return `push:location:${shareId}`;
}

export function birthdayPushIdempotencyKey(petId: string, year: number): string {
  return `push:birthday:${petId}:${year}`;
}

export function mergeNotificationPrefs(row: Partial<Record<NotificationPrefKey, unknown>> | null | undefined) {
  const out = { ...DEFAULT_NOTIFICATION_PREFS };
  (Object.keys(DEFAULT_NOTIFICATION_PREFS) as NotificationPrefKey[]).forEach((key) => {
    if (row && row[key] !== undefined && row[key] !== null) {
      out[key] = Number(row[key]) === 1 || row[key] === true;
    }
  });
  return out;
}

export function prefAllows(prefs: ReturnType<typeof mergeNotificationPrefs>, type: 'location' | 'birthday'): boolean {
  return type === 'location' ? prefs.location : prefs.birthday;
}

export function assignPushToken(
  existing: PushTokenRow | null,
  input: { userId: string; expoPushToken: string; platform: string; deviceId?: string | null; now: number; newId: string }
): { action: 'insert' | 'reassign' | 'refresh'; row: PushTokenRow } {
  if (!isExpoPushToken(input.expoPushToken)) {
    throw new Error('Token de push inválido');
  }
  if (existing && existing.expoPushToken === input.expoPushToken) {
    const reassigned = existing.userId !== input.userId;
    return {
      action: reassigned ? 'reassign' : 'refresh',
      row: {
        ...existing,
        userId: input.userId,
        platform: input.platform || existing.platform,
        deviceId: input.deviceId === undefined ? existing.deviceId : input.deviceId,
        enabled: true,
        updatedAt: input.now,
        lastSeenAt: input.now,
      },
    };
  }
  return {
    action: 'insert',
    row: {
      id: input.newId,
      userId: input.userId,
      expoPushToken: input.expoPushToken,
      platform: input.platform || 'android',
      deviceId: input.deviceId || null,
      enabled: true,
      createdAt: input.now,
      updatedAt: input.now,
      lastSeenAt: input.now,
    },
  };
}

export function disableToken(row: PushTokenRow, now: number): PushTokenRow {
  return { ...row, enabled: false, updatedAt: now };
}

export function locationPushCopy(petName: string, actorName?: string | null): { title: string; body: string } {
  const pet = String(petName || '').trim() || 'tu mascota';
  if (actorName) {
    return {
      title: `📍 ${actorName} te envió una ubicación`,
      body: `Ubicación compartida de ${pet}.`,
    };
  }
  return {
    title: '📍 Un invitado te envió una ubicación',
    body: `Ubicación compartida de ${pet}.`,
  };
}

export function birthdayPushCopy(petName: string, years: number): { title: string; body: string } {
  const name = String(petName || '').trim() || 'tu mascota';
  const age = years === 1 ? '1 año' : `${years} años`;
  return {
    title: `🎂 ¡Hoy ${name} cumple ${age}!`,
    body: 'Celebrá su día con Animaldex.',
  };
}

export function locationPushMessage(input: {
  token: string;
  petName: string;
  petId: string;
  shareId: string;
  actorName?: string | null;
}): Record<string, unknown> {
  const copy = locationPushCopy(input.petName, input.actorName);
  return {
    to: input.token,
    title: copy.title,
    body: copy.body,
    sound: 'default',
    priority: 'high',
    channelId: PUSH_CHANNEL_PETS_URGENT,
    data: {
      type: 'location',
      petId: input.petId,
      shareId: input.shareId,
      url: '/actividad',
    },
  };
}

export function birthdayPushMessage(input: {
  token: string;
  petName: string;
  petId: string;
  petUsername?: string | null;
  years: number;
}): Record<string, unknown> {
  const copy = birthdayPushCopy(input.petName, input.years);
  const handle = String(input.petUsername || '').trim();
  return {
    to: input.token,
    title: copy.title,
    body: copy.body,
    sound: 'default',
    priority: 'default',
    channelId: PUSH_CHANNEL_REMINDERS,
    data: {
      type: 'birthday',
      petId: input.petId,
      petUsername: handle || null,
      url: `/pet/${handle || input.petId}`,
    },
  };
}

export function payloadHasSensitiveLocation(payload: Record<string, unknown>): boolean {
  const text = `${payload.title || ''} ${payload.body || ''}`;
  const data = (payload.data && typeof payload.data === 'object' ? payload.data : {}) as Record<string, unknown>;
  const keys = Object.keys(data).map((k) => k.toLowerCase());
  if (keys.includes('lat') || keys.includes('lon') || keys.includes('latitude') || keys.includes('longitude')) {
    return true;
  }
  return /-?\d{1,3}\.\d{3,}/.test(text);
}

export function chunkTokens<T>(items: T[], size = EXPO_PUSH_BATCH_MAX): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function tokensToDisableFromTickets(
  tickets: Array<{ status?: string; details?: { error?: string }; message?: string }>,
  tokens: string[]
): string[] {
  const dead: string[] = [];
  tickets.forEach((ticket, i) => {
    const err = ticket?.details?.error || '';
    const message = String(ticket?.message || '');
    if (ticket?.status === 'error' && (err === 'DeviceNotRegistered' || message.includes('not a registered'))) {
      if (tokens[i]) dead.push(tokens[i]);
    }
  });
  return dead;
}

export function tokensToDisableFromReceipts(
  receipts: Record<string, { status?: string; details?: { error?: string } }>,
  ticketToToken: Record<string, string>
): string[] {
  const dead: string[] = [];
  Object.entries(receipts || {}).forEach(([ticketId, receipt]) => {
    if (receipt?.status === 'error' && receipt?.details?.error === 'DeviceNotRegistered') {
      const token = ticketToToken[ticketId];
      if (token) dead.push(token);
    }
  });
  return dead;
}

export type PushData = {
  type?: string;
  petId?: string;
  petUsername?: string;
  shareId?: string;
  url?: string;
};

export type PushNavTarget = {
  kind: 'pet' | 'activity' | 'none';
  petId?: string;
  shareId?: string;
};

function asPushField(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s && s !== 'null' && s !== 'undefined' ? s : undefined;
}

/** Acepta el `data` de Expo, un JSON string, o `{ data: {...} }` anidado. */
export function normalizePushData(raw: unknown): PushData {
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return normalizePushData(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  if (typeof raw !== 'object') return {};
  const d = raw as Record<string, unknown>;
  const inner =
    d.data && typeof d.data === 'object' && !Array.isArray(d.data)
      ? (d.data as Record<string, unknown>)
      : d;
  return {
    type: asPushField(inner.type),
    petId: asPushField(inner.petId),
    petUsername: asPushField(inner.petUsername),
    shareId: asPushField(inner.shareId),
    url: asPushField(inner.url),
  };
}

export function parsePushNav(data: unknown): PushNavTarget {
  const d = normalizePushData(data);
  if (d.type === 'birthday' || (d.url && d.url.startsWith('/pet/'))) {
    const fromUrl = d.url ? d.url.replace(/^\/pet\//, '') : '';
    return { kind: 'pet', petId: d.petUsername || fromUrl || d.petId };
  }
  if (d.type === 'location' || d.url === '/actividad') {
    return { kind: 'activity', petId: d.petId, shareId: d.shareId };
  }
  return { kind: 'none' };
}

export type PushTapPhase = 'foreground' | 'background' | 'cold';

export function pushTapFlushDecision(input: {
  hasPending: boolean;
  navReady: boolean;
  authReady: boolean;
  hasUser: boolean;
  navIsReady?: boolean;
}): 'idle' | 'wait' | 'apply' {
  if (!input.hasPending) return 'idle';
  if (!input.authReady || !input.navReady || input.navIsReady === false) return 'wait';
  if (!input.hasUser) return 'wait';
  return 'apply';
}

/** Destino existente: cumpleaños → PetProfile; ubicación → tab Actividad. */
export function pushNavDestination(
  data: unknown
): { name: 'PetProfile'; params: { petId: string } } | { name: 'Tabs'; params: { screen: 'Actividad' } } | null {
  const nav = parsePushNav(data);
  if (nav.kind === 'pet' && nav.petId) {
    return { name: 'PetProfile', params: { petId: nav.petId } };
  }
  if (nav.kind === 'activity') {
    return { name: 'Tabs', params: { screen: 'Actividad' } };
  }
  return null;
}

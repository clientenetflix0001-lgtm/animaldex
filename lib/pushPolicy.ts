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
export const PUSH_CHANNEL_REMINDERS = 'recordatorios';

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

export function locationPushCopy(petName: string): { title: string; body: string } {
  const name = String(petName || '').trim() || 'tu mascota';
  return {
    title: `📍 Nueva ubicación de ${name}`,
    body: `Alguien compartió una ubicación desde el perfil de ${name}.`,
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
}): Record<string, unknown> {
  const copy = locationPushCopy(input.petName);
  return {
    to: input.token,
    title: copy.title,
    body: copy.body,
    sound: 'default',
    channelId: PUSH_CHANNEL_PETS,
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

export function parsePushNav(data: { type?: string; petId?: string; petUsername?: string; url?: string } | null | undefined): {
  kind: 'pet' | 'activity' | 'none';
  petId?: string;
} {
  const d = data || {};
  if (d.type === 'birthday' || (d.url && String(d.url).startsWith('/pet/'))) {
    const fromUrl = d.url ? String(d.url).replace(/^\/pet\//, '') : '';
    return { kind: 'pet', petId: d.petUsername || fromUrl || d.petId };
  }
  if (d.type === 'location' || d.url === '/actividad') return { kind: 'activity' };
  return { kind: 'none' };
}

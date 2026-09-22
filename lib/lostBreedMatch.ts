import { localitiesMatch } from './feedGeo.ts';
import { breedBelongsToSpecies, breedById, breedDisplayLabel, breedPluralLabel } from './breeds.ts';

export { breedDisplayLabel as breedDisplayFromId };

export const LOST_BREED_MATCH_TYPE = 'lost_breed_match';
export const LOST_BREED_MATCH_WINDOW_MINUTES = 60;

export type MatchableAlert = {
  id: string;
  userId: string;
  type: string;
  status?: string | null;
  resolvedAt?: number | null;
  species?: string | null;
  breedId?: string | null;
  locality?: string | null;
  placeId?: string | null;
};

export function isActiveLostAlert(alert: MatchableAlert | null | undefined): boolean {
  if (!alert) return false;
  if (alert.type !== 'lost') return false;
  if (alert.resolvedAt) return false;
  const status = String(alert.status || 'active').toLowerCase();
  if (status === 'resolved' || status === 'closed' || status === 'deleted' || status === 'archived') {
    return false;
  }
  return true;
}

export function localitiesCompatible(
  a: { locality?: string | null; placeId?: string | null } | null | undefined,
  b: { locality?: string | null; placeId?: string | null } | null | undefined
): boolean {
  const placeA = String(a?.placeId || '').trim();
  const placeB = String(b?.placeId || '').trim();
  if (placeA && placeB) return placeA === placeB;
  return localitiesMatch(a?.locality, b?.locality);
}

export function lostFoundBreedMatch(lost: MatchableAlert, found: MatchableAlert): boolean {
  if (!isActiveLostAlert(lost)) return false;
  if (!found || found.type !== 'found') return false;
  const breedId = String(found.breedId || '').trim();
  if (!breedId || breedId !== String(lost.breedId || '').trim()) return false;
  if (!breedBelongsToSpecies(breedId, found.species) || !breedBelongsToSpecies(breedId, lost.species)) {
    return false;
  }
  const speciesFound = String(found.species || '').trim().toLowerCase();
  const speciesLost = String(lost.species || '').trim().toLowerCase();
  if (!speciesFound || speciesFound !== speciesLost) return false;
  return localitiesCompatible(lost, found);
}

export function lostBreedMatchGroupKey(input: {
  recipientUserId: string;
  lostAlertId: string;
  breedId: string;
  placeId?: string | null;
}): string {
  const place = String(input.placeId || '').trim() || 'none';
  return `lost_breed_match:${input.recipientUserId}:${input.lostAlertId}:${input.breedId}:${place}`;
}

export function lostBreedMatchIdempotencyKey(input: {
  foundAlertId: string;
  lostAlertId: string;
  recipientUserId: string;
}): string {
  return `lost_breed_match:${input.foundAlertId}:${input.lostAlertId}:${input.recipientUserId}`;
}

export function lostBreedMatchPushIdempotencyKey(input: {
  foundAlertId: string;
  lostAlertId: string;
  recipientUserId: string;
}): string {
  return `push:${lostBreedMatchIdempotencyKey(input)}`;
}

export function actorPublicName(actor: { username?: string | null; name?: string | null } | null | undefined): string {
  const username = String(actor?.username || '')
    .replace(/^@/, '')
    .trim();
  if (username) return username;
  return String(actor?.name || '').trim() || 'Alguien';
}

export function lostBreedMatchActivityCopy(input: {
  actorUsername: string;
  extraCount?: number;
  breedId: string;
}): { title: string; body: string } {
  const actor = String(input.actorUsername || '').replace(/^@/, '').trim() || 'Alguien';
  const extra = Math.max(0, input.extraCount || 0);
  const one = breedDisplayLabel(input.breedId) || 'mascota';
  const many = breedPluralLabel(input.breedId) || 'mascotas';
  if (extra <= 0) {
    const body = `${actor} reportó un ${one} encontrado cerca de tu zona.`;
    return { title: body, body };
  }
  const people = extra === 1 ? 'persona más' : 'personas más';
  const body = `${actor} y ${extra} ${people} reportaron ${many} encontrados cerca de tu zona.`;
  return { title: body, body };
}

export function lostBreedMatchPushCopy(input: {
  actorUsername: string;
  extraCount?: number;
  breedId: string;
}): { title: string; body: string } {
  const extra = Math.max(0, input.extraCount || 0);
  const activity = lostBreedMatchActivityCopy(input);
  return {
    title: extra <= 0 ? 'Posible coincidencia con tu mascota' : 'Posibles coincidencias con tu mascota',
    body: activity.body,
  };
}

export function shouldSkipSelfMatch(actorId: string | null | undefined, recipientId: string | null | undefined): boolean {
  if (!recipientId || !actorId) return false;
  return actorId === recipientId;
}

export function pickLostBreedMatchTargets(
  found: MatchableAlert,
  lostAlerts: MatchableAlert[],
  actorId?: string | null
): MatchableAlert[] {
  return lostAlerts.filter((lost) => {
    if (shouldSkipSelfMatch(actorId || found.userId, lost.userId)) return false;
    return lostFoundBreedMatch(lost, found);
  });
}

export function lostBreedMatchNavData(input: {
  foundAlertIds: string[];
  lostAlertId: string;
  breedId: string;
  placeId?: string | null;
  locality?: string | null;
}): { type: string; alertId?: string; url: string; lostAlertId: string; breedId: string; placeId?: string | null; locality?: string | null } {
  const ids = input.foundAlertIds.filter(Boolean);
  if (ids.length <= 1) {
    const alertId = ids[0];
    return {
      type: LOST_BREED_MATCH_TYPE,
      alertId,
      url: alertId ? `/a/${encodeURIComponent(alertId)}` : '/alertas',
      lostAlertId: input.lostAlertId,
      breedId: input.breedId,
      placeId: input.placeId || null,
      locality: input.locality || null,
    };
  }
  return {
    type: `${LOST_BREED_MATCH_TYPE}_list`,
    url: '/alertas',
    lostAlertId: input.lostAlertId,
    breedId: input.breedId,
    placeId: input.placeId || null,
    locality: input.locality || null,
  };
}

export function breedIdFromAlertRow(row: { breed_id?: string | null; breedId?: string | null }): string | null {
  const raw = row.breedId ?? row.breed_id;
  return breedById(raw)?.id || null;
}

export type LostBreedMatchEvent = {
  id: string;
  actorUsername: string;
  foundAlertId: string;
  lostAlertId: string;
  breedId: string;
  placeId?: string | null;
  locality?: string | null;
  createdAt: number;
};

export function groupLostBreedMatchEvents(events: LostBreedMatchEvent[]): Array<
  LostBreedMatchEvent & { extraCount: number; foundAlertIds: string[]; actorUsernames: string[] }
> {
  const groups = new Map<
    string,
    LostBreedMatchEvent & { extraCount: number; foundAlertIds: string[]; actorUsernames: string[] }
  >();
  const ordered: string[] = [];
  for (const event of events) {
    const key = `${event.lostAlertId}:${event.breedId}:${event.placeId || 'none'}`;
    const current = groups.get(key);
    if (!current) {
      groups.set(key, {
        ...event,
        extraCount: 0,
        foundAlertIds: [event.foundAlertId],
        actorUsernames: [event.actorUsername],
      });
      ordered.push(key);
      continue;
    }
    if (!current.foundAlertIds.includes(event.foundAlertId)) current.foundAlertIds.push(event.foundAlertId);
    if (!current.actorUsernames.includes(event.actorUsername)) {
      current.actorUsernames.push(event.actorUsername);
      current.extraCount = current.actorUsernames.length - 1;
    }
    if (event.createdAt > current.createdAt) current.createdAt = event.createdAt;
  }
  return ordered.map((key) => groups.get(key)!);
}

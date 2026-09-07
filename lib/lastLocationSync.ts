import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type AppStateStatus } from 'react-native';
import { db } from './db';
import { detectCurrentLocality } from './geo';
import {
  LAST_LOCATION_CACHE_KEY,
  LAST_LOCATION_POLICY,
  fallbackLocality,
  locationIsStale,
  parseLastLocation,
  shouldWriteLastLocation,
  type LastLocationSnapshot,
} from './lastLocation.ts';

let inflight: Promise<LastLocationSnapshot | null> | null = null;
let appStateBound = false;

export async function readCachedLastLocation(): Promise<LastLocationSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_LOCATION_CACHE_KEY);
    return raw ? parseLastLocation(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function writeCachedLastLocation(snapshot: LastLocationSnapshot): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_LOCATION_CACHE_KEY, JSON.stringify(snapshot));
  } catch {}
}

export async function syncLastUsefulLocation(input?: {
  profileLocality?: string | null;
  profileLocationText?: string | null;
  force?: boolean;
}): Promise<LastLocationSnapshot | null> {
  if (inflight) return inflight;
  inflight = (async () => {
    const now = Date.now();
    const cached = await readCachedLastLocation();
    if (!input?.force && cached && !locationIsStale(cached, now, LAST_LOCATION_POLICY.staleMs)) {
      return cached;
    }

    const gps = await detectCurrentLocality();
    const locality = fallbackLocality(gps?.locality, input?.profileLocality, input?.profileLocationText);
    const next: LastLocationSnapshot = {
      lat: gps?.lat ?? cached?.lat ?? null,
      lng: gps?.lon ?? cached?.lng ?? null,
      locality,
      updatedAt: gps || locality ? now : cached?.updatedAt ?? now,
      source: gps ? 'gps' : locality ? 'profile' : 'cache',
    };

    if (!next.lat && !next.lng && !next.locality) return cached;

    await writeCachedLastLocation(next);

    if (shouldWriteLastLocation(cached, next, now)) {
      try {
        await db.updateLastLocation({
          lat: next.lat,
          lng: next.lng,
          locality: next.locality,
          updatedAt: next.updatedAt,
        });
      } catch {}
    }
    return next;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function bindLastLocationForegroundSync(getProfileHint: () => {
  profileLocality?: string | null;
  profileLocationText?: string | null;
}): () => void {
  if (appStateBound) return () => {};
  appStateBound = true;
  const onChange = (state: AppStateStatus) => {
    if (state === 'active') {
      void syncLastUsefulLocation(getProfileHint());
    }
  };
  const sub = AppState.addEventListener('change', onChange);
  void syncLastUsefulLocation(getProfileHint());
  return () => {
    appStateBound = false;
    sub.remove();
  };
}

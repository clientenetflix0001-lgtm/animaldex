// ============================================================
// Señal de ubicación para el orden de Inicio.
// ============================================================
// Hasta Fase 4 esta era la última pieza que usaba el reverse geocoder del
// sistema operativo como identidad territorial:
//
//   detectCurrentLocality() -> Location.reverseGeocodeAsync() -> texto
//
// El texto del sistema operativo no es un identificador: difiere entre Android
// e iOS, cambia entre versiones y no se puede comparar con el catálogo. Desde
// Fase 5 la señal sale de `locateCurrentPlace()`, que pasa por el endpoint
// /geo y devuelve lugares del catálogo.
//
// PRIVACIDAD: la coordenada del dispositivo se usa dentro de
// `locateCurrentPlace()` y no sale de ahí. Lo que se guarda en caché y se
// manda al servidor es el centroide del lugar, que es público. Nada de esto se
// registra en logs.
//
// RANKING AUTOMÁTICO: esto ordena Inicio sin que nadie lo pida, así que no
// puede inventar una localidad. Si /geo pide confirmación, se degrada al
// departamento oficial —que viene de contención de polígono y sí es confiable—
// y si tampoco lo hay, no se afirma territorio alguno.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type AppStateStatus } from 'react-native';
import { db } from './db';
import { locateCurrentPlace } from './placeLocate';
import { placeSignalFromResolution } from './lastLocationSignal.ts';
import {
  LAST_LOCATION_CACHE_KEY,
  LAST_LOCATION_POLICY,
  fallbackLocality,
  localityChanged,
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

    const { place, territory } = placeSignalFromResolution(await locateCurrentPlace());
    const locality = fallbackLocality(place?.localityName, input?.profileLocality, input?.profileLocationText);
    // La identidad anterior sólo se conserva si sigue hablando del mismo lugar.
    const carried = cached && !localityChanged(cached, locality) ? cached.territory : null;
    const next: LastLocationSnapshot = {
      // Centroide del lugar, no la posición del dispositivo. Si esta vuelta no
      // se pudo afirmar un lugar, se conserva el punto anterior: esto es la
      // última ubicación útil, no un rastreo.
      lat: place?.centroidLat ?? cached?.lat ?? null,
      lng: place?.centroidLng ?? cached?.lng ?? null,
      locality,
      territory: territory ?? carried,
      updatedAt: place || territory || locality ? now : cached?.updatedAt ?? now,
      source: place || territory ? 'geo' : locality ? 'profile' : 'cache',
    };

    if (next.lat == null && next.lng == null && !next.locality && !next.territory) return cached;

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

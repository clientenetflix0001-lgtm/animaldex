// ============================================================
// Animaldex — Ubicación y resolución de localidad
// ============================================================
// Usa expo-location SOLO para determinar la localidad del usuario
// (geocodificación inversa), NO para mostrar mapas. El resultado se
// usa como filtro de texto sobre el feed de Alertas.
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProvinceForLocality } from './localities';

export interface ResolvedLocality {
  locality: string;
  province: string | null;
  lat: number | null;
  lon: number | null;
}

const ALERTS_LOCALITY_KEY = 'animaldex-alerts-locality';

// Pide permiso de ubicación y resuelve la localidad actual del
// dispositivo. Devuelve null si el usuario deniega el permiso o algo
// falla (nunca lanza excepción hacia la UI).
export async function detectCurrentLocality(): Promise<ResolvedLocality | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;

    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude } = pos.coords;

    const results = await Location.reverseGeocodeAsync({ latitude, longitude });
    const r = results[0];
    if (!r) return { locality: '', province: null, lat: latitude, lon: longitude };

    const locality = r.city || r.subregion || r.district || r.name || '';
    const province = r.region || null;

    return { locality, province, lat: latitude, lon: longitude };
  } catch {
    return null;
  }
}

// Persistencia de la localidad elegida por el usuario para el filtro
// de Alertas (independiente de la ubicación real del dispositivo).
export async function saveAlertsLocality(entry: { locality: string; province: string | null }): Promise<void> {
  try {
    await AsyncStorage.setItem(ALERTS_LOCALITY_KEY, JSON.stringify(entry));
  } catch {}
}

export async function loadSavedAlertsLocality(): Promise<{ locality: string; province: string | null } | null> {
  try {
    const raw = await AsyncStorage.getItem(ALERTS_LOCALITY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.locality === 'string' && parsed.locality) return parsed;
    return null;
  } catch {
    return null;
  }
}

// Completa la provincia a partir del dataset local cuando el GPS no
// la determina bien (o cuando el usuario elige de la lista curada).
export function withProvinceFallback(locality: string, province: string | null): string | null {
  return province || getProvinceForLocality(locality);
}

// Permiso de ubicación en primer plano. No detecta municipio ni llama a GEO.
import * as Location from 'expo-location';

export async function getForegroundLocationGranted(): Promise<boolean> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    return current.status === 'granted';
  } catch {
    return false;
  }
}

/** Si el permiso ya está concedido, no vuelve a pedirlo al sistema. */
export async function requestForegroundLocationIfNeeded(): Promise<boolean> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status === 'granted') return true;
    const next = await Location.requestForegroundPermissionsAsync();
    return next.status === 'granted';
  } catch {
    return false;
  }
}

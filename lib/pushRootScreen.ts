import { navigationRef } from './navigationRef.ts';
import type { RootStackParamList } from './types.ts';

/**
 * Abre una pantalla del Root Stack desde el container.
 * Evita que el native-stack del tab (Crear/Alertas) intente pushear
 * una ruta que no declara — en Android eso deja la pantalla gris/crash.
 */
export function pushRootScreen<Name extends keyof RootStackParamList>(
  name: Name,
  params?: RootStackParamList[Name]
): boolean {
  if (!navigationRef.isReady()) return false;
  navigationRef.navigate(name as never, params as never);
  return true;
}

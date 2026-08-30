import type { ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { TabParamList } from './types.ts';

type IonName = ComponentProps<typeof Ionicons>['name'];

export const TAB_ICONS: Record<keyof TabParamList, { on: IonName; off: IonName }> = {
  Inicio: { on: 'home', off: 'home-outline' },
  Reels: { on: 'film', off: 'film-outline' },
  Alertas: { on: 'warning', off: 'warning-outline' },
  Mercado: { on: 'storefront', off: 'storefront-outline' },
  Crear: { on: 'add-circle', off: 'add-circle-outline' },
  Mascotas: { on: 'paw', off: 'paw-outline' },
  Actividad: { on: 'heart', off: 'heart-outline' },
  Perfil: { on: 'person', off: 'person-outline' },
};

export const TAB_LABELS: Record<keyof TabParamList, string> = {
  Inicio: 'Inicio',
  Reels: 'Reels',
  Alertas: 'Alertas',
  Mercado: 'Mercado',
  Crear: 'Crear',
  Mascotas: 'Mascotas',
  Actividad: 'Actividad',
  Perfil: 'Perfil',
};

/** Barra móvil visible: Inicio | Reels | Alertas | + | Mascotas | Mercado | Perfil */
export const MOBILE_TAB_ORDER: (keyof TabParamList)[] = [
  'Inicio',
  'Reels',
  'Alertas',
  'Crear',
  'Mascotas',
  'Mercado',
  'Perfil',
];

export function isMainTabActive(focused: string, name: string): boolean {
  return focused === name;
}

export function tabImmediatelyAfter(order: readonly string[], after: string): string | undefined {
  const i = order.indexOf(after);
  if (i < 0 || i + 1 >= order.length) return undefined;
  return order[i + 1];
}

import { ADOPTION_PURPLE } from './adoptionDiscovery.ts';
import { colors } from './theme.ts';

/** Una vuelta del aro, en ms. Lenta y lineal para que se lea como Stories, no como alarma. */
export const PET_STATUS_RING_MS = 4000;
export const PET_STATUS_RING_WIDTH = 3;
export const PET_STATUS_RING_GAP = 2;

export const PET_STATUS_RING_GREEN = ['#28C76F', '#39D37A', '#8AF0AD', '#47E68A'] as const;
export const PET_STATUS_RING_RED = [colors.heart, colors.primary, '#FF8A9A'] as const;
export const PET_STATUS_RING_PURPLE = [ADOPTION_PURPLE, '#C47BFF', '#8B2EE8'] as const;

export type PetStatusRingTone = 'green' | 'red' | 'purple';

/** Mapea care_status reales. No inventa estados. */
export function petStatusRingTone(status: string | null | undefined): PetStatusRingTone | null {
  if (status === 'en_casa' || status === 'en_recuperacion') return 'green';
  if (status === 'perdido') return 'red';
  if (status === 'en_adopcion') return 'purple';
  return null;
}

export function petStatusRingColors(status: string | null | undefined): readonly string[] | null {
  const tone = petStatusRingTone(status);
  if (tone === 'green') return PET_STATUS_RING_GREEN;
  if (tone === 'red') return PET_STATUS_RING_RED;
  if (tone === 'purple') return PET_STATUS_RING_PURPLE;
  return null;
}

export function petStatusRingOuterSize(photoSize: number): number {
  return photoSize + 2 * (PET_STATUS_RING_WIDTH + PET_STATUS_RING_GAP);
}

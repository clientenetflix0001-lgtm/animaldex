/** Overlay de huellas: un PNG estático reutilizable, no un asset por post. */

export const PAWS_PER_LAYOUT = 5;
/** Ionicons era 1 View + 5 iconos. El overlay nuevo es 1 Image. */
export const LEGACY_IONICON_PAW_NODES = 6;
export const PAW_OVERLAY_DECORATIVE_NODES = 1;

export const PAW_LAYOUTS = [
  [
    { top: '7%', left: '8%', rotate: '-24deg', size: 22 },
    { top: '16%', left: '74%', rotate: '18deg', size: 28 },
    { top: '62%', left: '6%', rotate: '10deg', size: 24 },
    { top: '70%', left: '72%', rotate: '-14deg', size: 30 },
    { top: '42%', left: '44%', rotate: '8deg', size: 18 },
  ],
  [
    { top: '10%', left: '18%', rotate: '16deg', size: 20 },
    { top: '22%', left: '68%', rotate: '-20deg', size: 26 },
    { top: '58%', left: '12%', rotate: '-8deg', size: 22 },
    { top: '74%', left: '62%', rotate: '22deg', size: 28 },
    { top: '38%', left: '78%', rotate: '4deg', size: 16 },
  ],
  [
    { top: '6%', left: '62%', rotate: '-12deg', size: 24 },
    { top: '28%', left: '8%', rotate: '20deg', size: 20 },
    { top: '54%', left: '70%', rotate: '-18deg', size: 26 },
    { top: '76%', left: '18%', rotate: '10deg', size: 22 },
    { top: '44%', left: '40%', rotate: '-6deg', size: 17 },
  ],
] as const;

export function pawLayoutIndexForBackgroundId(id: string): number {
  let n = 0;
  for (let i = 0; i < id.length; i++) n += id.charCodeAt(i) * (i + 1);
  return Math.abs(n) % PAW_LAYOUTS.length;
}

export function pawNativeViewsPerOverlay(): number {
  return PAW_OVERLAY_DECORATIVE_NODES;
}

/**
 * Costo comparado contra 35db31c (huellas solo en pattern paws) y contra
 * el overlay de 5 Ionicons (5576d44).
 */
export function pawOverlayCost(backgrounds: readonly { pattern?: string }[]): {
  historicalCardsWithPaws: number;
  currentCardsWithPaws: number;
  ioniconNodesPerCard: number;
  staticNodesPerCard: number;
  extraIoniconNodesIfAllVisible: number;
} {
  const historicalCardsWithPaws = backgrounds.filter((bg) => bg.pattern === 'paws').length;
  const currentCardsWithPaws = backgrounds.length;
  return {
    historicalCardsWithPaws,
    currentCardsWithPaws,
    ioniconNodesPerCard: LEGACY_IONICON_PAW_NODES,
    staticNodesPerCard: PAW_OVERLAY_DECORATIVE_NODES,
    extraIoniconNodesIfAllVisible: (currentCardsWithPaws - historicalCardsWithPaws) * PAWS_PER_LAYOUT,
  };
}

export type CreateChooserKind = 'post' | 'story' | 'reel' | 'flyer';
export type CreateChooserDestination = 'CreatePost' | 'CreateStory' | 'CreateReel' | 'CreateAlert';

export function createChooserDestination(kind: CreateChooserKind): CreateChooserDestination {
  if (kind === 'story') return 'CreateStory';
  if (kind === 'reel') return 'CreateReel';
  if (kind === 'flyer') return 'CreateAlert';
  return 'CreatePost';
}

export function createChooserParams(kind: CreateChooserKind): { purpose: 'flyer' } | undefined {
  return kind === 'flyer' ? { purpose: 'flyer' } : undefined;
}

/** Destino del Root Stack. Navegar desde la pantalla +, no desde el Tab parent. */
export function createChooserOpen(kind: CreateChooserKind): {
  screen: CreateChooserDestination;
  params?: { purpose: 'flyer' };
} {
  return { screen: createChooserDestination(kind), params: createChooserParams(kind) };
}

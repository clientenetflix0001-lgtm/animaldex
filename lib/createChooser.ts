export type CreateChooserKind = 'post' | 'story' | 'reel' | 'flyer';
export type CreateChooserRootDestination = 'CreateStory' | 'CreateReel';
export type CreateChooserDestination = CreateChooserRootDestination | 'CreatePost' | 'CreateFlyerDraft';

export function createChooserDestination(kind: CreateChooserKind): CreateChooserDestination {
  if (kind === 'story') return 'CreateStory';
  if (kind === 'reel') return 'CreateReel';
  if (kind === 'flyer') return 'CreateFlyerDraft';
  return 'CreatePost';
}

export function createChooserParams(kind: CreateChooserKind): { purpose: 'flyer' } | undefined {
  return kind === 'flyer' ? { purpose: 'flyer' } : undefined;
}

export function createChooserOpensInCrearStack(kind: CreateChooserKind): boolean {
  return kind === 'flyer' || kind === 'post';
}

/** Post y flyer quedan en el stack del tab Crear. Story/reel siguen en Root Stack. */
export function createChooserOpen(kind: CreateChooserKind): {
  screen: CreateChooserDestination;
  params?: { purpose: 'flyer' };
} {
  return { screen: createChooserDestination(kind), params: createChooserParams(kind) };
}

export type CreateChooserKind = 'post' | 'story' | 'reel' | 'flyer';
export type CreateChooserRootDestination = 'CreatePost' | 'CreateStory' | 'CreateReel';
export type CreateChooserDestination = CreateChooserRootDestination | 'CreateFlyerDraft';

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
  return kind === 'flyer';
}

/** Flyer queda en el stack del tab Crear. Post/story/reel siguen en Root Stack. */
export function createChooserOpen(kind: CreateChooserKind): {
  screen: CreateChooserDestination;
  params?: { purpose: 'flyer' };
} {
  return { screen: createChooserDestination(kind), params: createChooserParams(kind) };
}

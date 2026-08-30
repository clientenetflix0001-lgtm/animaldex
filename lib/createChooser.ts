export type CreateChooserKind = 'post' | 'reel';

export function createChooserDestination(kind: CreateChooserKind): 'CreatePost' | 'CreateReel' {
  return kind === 'reel' ? 'CreateReel' : 'CreatePost';
}

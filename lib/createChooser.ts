export type CreateChooserKind = 'post' | 'story' | 'reel';

export function createChooserDestination(kind: CreateChooserKind): 'CreatePost' | 'CreateStory' | 'CreateReel' {
  if (kind === 'story') return 'CreateStory';
  if (kind === 'reel') return 'CreateReel';
  return 'CreatePost';
}

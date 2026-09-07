type Listener = (revision: number) => void;

let revision = 0;
const listeners = new Set<Listener>();

export function getStoriesRevision(): number {
  return revision;
}

export function bumpStoriesRevision(current: number): number {
  return current + 1;
}

export function shouldRefreshStoryRail(prevRevision: number, nextRevision: number): boolean {
  return nextRevision > prevRevision;
}

export function notifyStoriesChanged(): number {
  revision = bumpStoriesRevision(revision);
  listeners.forEach((fn) => fn(revision));
  return revision;
}

export function subscribeStoriesRevision(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Rail refresca Stories; el Feed de posts no se invalida. */
export function storyPublishInvalidatesFeedPosts(): boolean {
  return false;
}

export function storyPublishRequiresRelogin(): boolean {
  return false;
}

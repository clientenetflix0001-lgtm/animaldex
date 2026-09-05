import { useEffect, useState } from 'react';
import { getStoriesRevision, subscribeStoriesRevision } from './storyRailRefresh.ts';

export function useStoriesRevision(): number {
  const [revision, setRevision] = useState(getStoriesRevision);
  useEffect(() => subscribeStoriesRevision(setRevision), []);
  return revision;
}

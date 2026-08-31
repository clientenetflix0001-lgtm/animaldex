import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { FeedReelsPage } from './feedReelsNav.ts';

type Ctx = {
  page: FeedReelsPage;
  setPage: (page: FeedReelsPage) => void;
};

const FeedReelsNavContext = createContext<Ctx>({
  page: 0,
  setPage: () => {},
});

export function FeedReelsNavProvider({ children }: { children: React.ReactNode }) {
  const [page, setPageState] = useState<FeedReelsPage>(0);
  const setPage = useCallback((next: FeedReelsPage) => {
    setPageState((prev) => (prev === next ? prev : next));
  }, []);
  const value = useMemo(() => ({ page, setPage }), [page, setPage]);
  return <FeedReelsNavContext.Provider value={value}>{children}</FeedReelsNavContext.Provider>;
}

export function useFeedReelsNav(): Ctx {
  return useContext(FeedReelsNavContext);
}

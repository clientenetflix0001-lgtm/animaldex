import React, { createContext, useContext } from 'react';

const ReelsPageVisibleContext = createContext(false);

export function ReelsPageVisibleProvider({
  visible,
  children,
}: {
  visible: boolean;
  children: React.ReactNode;
}) {
  return <ReelsPageVisibleContext.Provider value={visible}>{children}</ReelsPageVisibleContext.Provider>;
}

export function useReelsPageVisible(): boolean {
  return useContext(ReelsPageVisibleContext);
}

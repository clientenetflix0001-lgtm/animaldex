import React, { useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import ReelsScreen from './ReelsScreen';
import { db, type ApiReel } from '../lib/db';
import type { RootStackParamList } from '../lib/types';
import { ReelsPageVisibleProvider } from '../lib/reelsFocus';
import { reelViewerStartIndex, type ReelGridScope } from '../lib/reelGrid';

export default function ReelViewerScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ReelViewer'>>();
  const { reelId, scope, scopeId, initialReels, initialIndex } = route.params;
  const seeded = initialReels && initialReels.length ? initialReels : null;
  const [reel, setReel] = useState<ApiReel | null>(seeded?.find((r) => r.id === reelId) || null);
  const [tried, setTried] = useState(!!seeded);

  const listScope: ReelGridScope = useMemo(() => {
    if (scope === 'profile' && scopeId) return { type: 'profile', id: scopeId };
    if (scope === 'pet' && scopeId) return { type: 'pet', id: scopeId };
    if (scope === 'user' && scopeId) return { type: 'user', id: scopeId };
    return { type: 'feed' };
  }, [scope, scopeId]);

  useEffect(() => {
    if (seeded) return;
    let cancelled = false;
    (async () => {
      try {
        const { reel: row } = await db.reelDetail(reelId);
        if (!cancelled) setReel(row);
      } catch {
        try {
          const { reel: row } = await db.myReel(reelId);
          if (!cancelled) setReel(row);
        } catch {
          if (!cancelled) setReel(null);
        }
      } finally {
        if (!cancelled) setTried(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reelId, seeded]);

  if (!tried) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  const start = seeded
    ? reelViewerStartIndex(seeded, reelId, initialIndex ?? 0)
    : 0;

  return (
    <ReelsPageVisibleProvider visible>
      <ReelsScreen
        initialReel={reel}
        initialReels={seeded}
        initialIndex={start}
        scope={listScope}
      />
    </ReelsPageVisibleProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
});

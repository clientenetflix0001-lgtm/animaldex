import React, { useEffect, useMemo, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, Pressable } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import ReelsScreen from './ReelsScreen';
import { db, type ApiReel } from '../lib/db';
import type { RootStackParamList } from '../lib/types';
import { ReelsPageVisibleProvider } from '../lib/reelsFocus';
import { reelViewerStartIndex, type ReelGridScope } from '../lib/reelGrid';
import { REEL_UNAVAILABLE_COPY, reelViewerSurface } from '../lib/reelActivity';
import { colors } from '../lib/theme';

export default function ReelViewerScreen() {
  const navigation = useNavigation<any>();
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

  const surface = reelViewerSurface(reel, tried, { fromSeededList: !!seeded });

  if (surface === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (surface === 'unavailable') {
    return (
      <View style={styles.center}>
        <Text style={styles.unavailable}>{REEL_UNAVAILABLE_COPY}</Text>
        <Pressable
          style={styles.back}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Volver"
        >
          <Text style={styles.backT}>Volver</Text>
        </Pressable>
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
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  unavailable: { color: '#fff', fontWeight: '800', fontSize: 16, textAlign: 'center' },
  back: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  backT: { color: '#fff', fontWeight: '800' },
});

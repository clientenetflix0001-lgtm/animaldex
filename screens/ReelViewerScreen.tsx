import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import ReelsScreen from './ReelsScreen';
import { db, type ApiReel } from '../lib/db';
import type { RootStackParamList } from '../lib/types';
import { ReelsPageVisibleProvider } from '../lib/reelsFocus';

export default function ReelViewerScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ReelViewer'>>();
  const [reel, setReel] = useState<ApiReel | null>(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    db.reelDetail(route.params.reelId)
      .then(({ reel: row }) => setReel(row))
      .catch(() => setReel(null))
      .finally(() => setTried(true));
  }, [route.params.reelId]);

  if (!tried) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <ReelsPageVisibleProvider visible>
      <ReelsScreen initialReel={reel} />
    </ReelsPageVisibleProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
});

import React, { useEffect, useState, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import CreateAlertScreen from './CreateAlertScreen';
import AlertFlyerPreviewScreen from './AlertFlyerPreviewScreen';
import { FlyerFlowBoundary } from '../components/FlyerFlowBoundary';
import { flyerDebug } from '../lib/flyerDebug';
import { startEmptyFlyerDraft } from '../lib/alertFlyerSession';
import { CREAR_FLYER_DRAFT_ROUTE, CREAR_FLYER_PREVIEW_ROUTE } from '../lib/crearFlyerRoutes';
import { useAppTheme, type ThemeColors } from '../lib/theme';

function bootEmptyFlyerDraft(): 'ready' | 'error' {
  try {
    void flyerDebug('CREATE_FLYER_DRAFT_INIT', {
      route: CREAR_FLYER_DRAFT_ROUTE,
      navigator: 'CrearStack',
    });
    startEmptyFlyerDraft();
    void flyerDebug('CREATE_FLYER_DRAFT_READY', {
      route: CREAR_FLYER_DRAFT_ROUTE,
      navigator: 'CrearStack',
      draftReady: false,
    });
    return 'ready';
  } catch {
    void flyerDebug('CREATE_FLYER_DRAFT_ERROR', {
      route: CREAR_FLYER_DRAFT_ROUTE,
      navigator: 'CrearStack',
    });
    return 'error';
  }
}

export function CreateFlyerDraftScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [boot] = useState<'ready' | 'error'>(() => bootEmptyFlyerDraft());

  useEffect(() => {
    void flyerDebug('FLYER_DEBUG_03_SCREEN_MOUNT', {
      route: CREAR_FLYER_DRAFT_ROUTE,
      navigator: 'CrearStack',
      dest: CREAR_FLYER_DRAFT_ROUTE,
    });
    void flyerDebug('FLYER_DEBUG_05_FORM_RENDER', {
      route: CREAR_FLYER_DRAFT_ROUTE,
      navigator: 'CrearStack',
    });
  }, []);

  if (boot === 'error') {
    return (
      <View style={styles.box}>
        <Text style={styles.text}>No pudimos abrir el flyer. Volvé e intentá de nuevo.</Text>
      </View>
    );
  }

  return <CreateAlertScreen />;
}

export function CreateFlyerPreviewScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  useEffect(() => {
    void flyerDebug('FLYER_DEBUG_07_PREVIEW_MOUNT', {
      route: CREAR_FLYER_PREVIEW_ROUTE,
      navigator: 'CrearStack',
      dest: CREAR_FLYER_PREVIEW_ROUTE,
    });
  }, []);

  return (
    <FlyerFlowBoundary route={CREAR_FLYER_PREVIEW_ROUTE}>
      <AlertFlyerPreviewScreen />
    </FlyerFlowBoundary>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  text: { textAlign: 'center', fontWeight: '800', fontSize: 15, color: colors.text },
});
}

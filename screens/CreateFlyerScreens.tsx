import React, { useEffect } from 'react';
import CreateAlertScreen from './CreateAlertScreen';
import AlertFlyerPreviewScreen from './AlertFlyerPreviewScreen';
import { FlyerFlowBoundary } from '../components/FlyerFlowBoundary';
import { flyerDebug } from '../lib/flyerDebug';
import { isFlyerDraftReady } from '../lib/alertFlyerSession';
import { CREAR_FLYER_DRAFT_ROUTE, CREAR_FLYER_PREVIEW_ROUTE } from '../lib/crearFlyerRoutes';

export function CreateFlyerDraftScreen() {
  useEffect(() => {
    void flyerDebug('FLYER_DEBUG_03_SCREEN_MOUNT', {
      route: CREAR_FLYER_DRAFT_ROUTE,
      navigator: 'CrearStack',
      dest: CREAR_FLYER_DRAFT_ROUTE,
    });
    void flyerDebug('FLYER_DEBUG_04_DRAFT_INIT', {
      route: CREAR_FLYER_DRAFT_ROUTE,
      navigator: 'CrearStack',
      draftReady: isFlyerDraftReady(),
    });
    void flyerDebug('FLYER_DEBUG_05_FORM_RENDER', {
      route: CREAR_FLYER_DRAFT_ROUTE,
      navigator: 'CrearStack',
    });
  }, []);

  return (
    <FlyerFlowBoundary route={CREAR_FLYER_DRAFT_ROUTE}>
      <CreateAlertScreen />
    </FlyerFlowBoundary>
  );
}

export function CreateFlyerPreviewScreen() {
  useEffect(() => {
    void flyerDebug('FLYER_DEBUG_07_PREVIEW_MOUNT', {
      route: CREAR_FLYER_PREVIEW_ROUTE,
      navigator: 'CrearStack',
      dest: CREAR_FLYER_PREVIEW_ROUTE,
      draftReady: isFlyerDraftReady(),
    });
  }, []);

  return (
    <FlyerFlowBoundary route={CREAR_FLYER_PREVIEW_ROUTE}>
      <AlertFlyerPreviewScreen />
    </FlyerFlowBoundary>
  );
}

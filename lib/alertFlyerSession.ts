import { buildAlertFlyerData, type AlertFlyerSession, type AlertFlyerSource } from './alertFlyer.ts';

let flyerDraft: AlertFlyerSession | null = null;

/** Draft local vacío. Sin alerta, mascota ni persistencia. */
export function emptyFlyerDraft(): AlertFlyerSession {
  return {
    source: 'draft',
    flyer: buildAlertFlyerData({ type: 'lost' }),
  };
}

/** + → Crear flyer: nace en memoria, limpio, sin exigir alertId/petId. */
export function startEmptyFlyerDraft(): AlertFlyerSession {
  setFlyerDraft(emptyFlyerDraft());
  return flyerDraft!;
}

export function setFlyerDraft(session: AlertFlyerSession): void {
  flyerDraft = {
    ...session,
    source: 'draft',
    alertId: undefined,
  };
}

export function getFlyerDraft(): AlertFlyerSession | null {
  return flyerDraft;
}

export function clearFlyerDraft(): void {
  flyerDraft = null;
}

export type FlyerPreviewParams = {
  alertId?: string;
  from?: AlertFlyerSource;
};

export type FlyerPreviewOrigin =
  | { mode: 'existing'; alertId: string }
  | { mode: 'draft' }
  | { mode: 'invalid' };

export function isFlyerDraftReady(session: AlertFlyerSession | null | undefined = flyerDraft): boolean {
  if (!session || session.source !== 'draft') return false;
  const image = String(session.flyer?.image || session.publish?.image || '').trim();
  const locality = String(session.flyer?.location || session.publish?.locality || '').trim();
  const type = session.flyer?.type || session.publish?.type;
  return Boolean(type && image && locality);
}

export function resolveFlyerPreviewOrigin(params?: FlyerPreviewParams | null): FlyerPreviewOrigin {
  const alertId = String(params?.alertId || '').trim();
  if (alertId) return { mode: 'existing', alertId };
  if (params?.from === 'draft' && isFlyerDraftReady(flyerDraft)) return { mode: 'draft' };
  return { mode: 'invalid' };
}

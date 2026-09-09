import type { AlertFlyerSession, AlertFlyerSource } from './alertFlyer.ts';

let flyerDraft: AlertFlyerSession | null = null;

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
  source?: AlertFlyerSource;
};

export type FlyerPreviewOrigin =
  | { mode: 'existing'; alertId: string }
  | { mode: 'draft' }
  | { mode: 'invalid' };

export function resolveFlyerPreviewOrigin(params?: FlyerPreviewParams | null): FlyerPreviewOrigin {
  const alertId = String(params?.alertId || '').trim();
  if (alertId) return { mode: 'existing', alertId };
  if (params?.source === 'draft' || flyerDraft) return { mode: 'draft' };
  return { mode: 'invalid' };
}

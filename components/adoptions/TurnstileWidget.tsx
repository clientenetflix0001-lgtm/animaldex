// Cloudflare Turnstile (solo web). Por defecto no muestra nada: solo aparece
// un desafío si Cloudflare lo necesita. Sin site key, la publicación sin
// cuenta queda deshabilitada (el Worker también la rechaza).
import React, { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import { TURNSTILE_ACTION } from '../../lib/adoptionLifecycle';

export const TURNSTILE_SITE_KEY: string = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY || '';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  const w = window as unknown as { turnstile?: TurnstileApi };
  if (w.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error('turnstile'));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

interface Props {
  onToken: (token: string | null) => void;
}

export function TurnstileWidget({ onToken }: Props) {
  const ref = useRef<View>(null);
  const cb = useRef(onToken);
  cb.current = onToken;

  useEffect(() => {
    if (Platform.OS !== 'web' || !TURNSTILE_SITE_KEY) return;
    let cancelled = false;
    let widgetId: string | null = null;
    loadScript()
      .then(() => {
        const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
        const el = ref.current as unknown as HTMLElement | null;
        if (cancelled || !api || !el) return;
        widgetId = api.render(el, {
          sitekey: TURNSTILE_SITE_KEY,
          action: TURNSTILE_ACTION,
          appearance: 'interaction-only',
          theme: 'auto',
          language: 'es',
          callback: (t: string) => cb.current(t),
          'expired-callback': () => cb.current(null),
          'error-callback': () => cb.current(null),
        });
      })
      .catch(() => cb.current(null));
    return () => {
      cancelled = true;
      const api = (window as unknown as { turnstile?: TurnstileApi }).turnstile;
      if (widgetId && api) api.remove(widgetId);
    };
  }, []);

  if (Platform.OS !== 'web' || !TURNSTILE_SITE_KEY) return null;
  return <View ref={ref} />;
}

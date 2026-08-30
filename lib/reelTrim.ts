/**
 * Recorte de Reels. react-native-video-trim@8.2.2
 * maxDuration está en MILISEGUNDOS (30000 = 30 s), no en segundos.
 * Requiere código nativo: el próximo AAB / EAS Build. No Expo Go.
 */
import { REEL_MAX_DURATION_MS, galleryNeedsTrim, reelUploadSource } from './reels.ts';

export const REEL_TRIM_MAX_DURATION_MS = REEL_MAX_DURATION_MS;

export type ReelTrimFinish = {
  outputPath: string;
  startTime?: number;
  endTime?: number;
  duration?: number;
};

export type ReelTrimOutcome =
  | { status: 'finished'; uri: string; durationMs: number | null }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export function reelTrimEditorConfig() {
  return {
    maxDuration: REEL_TRIM_MAX_DURATION_MS,
    minDuration: 1000,
    saveToPhoto: false,
    openShareSheetOnFinish: false,
    openDocumentsOnFinish: false,
    enablePreciseTrimming: true,
    enableEditTools: false,
    closeWhenFinish: true,
    theme: 'dark' as const,
    headerText: 'Recortar Reel',
    cancelButtonText: 'Cancelar',
    saveButtonText: 'Usar',
    trimmingText: 'Recortando…',
    durationFormat: 'mm:ss' as const,
    enableSaveDialog: false,
    enableCancelDialog: true,
    cancelDialogTitle: '¿Cancelar recorte?',
    cancelDialogMessage: 'No se usará este segmento.',
    cancelDialogCancelText: 'Seguir',
    cancelDialogConfirmText: 'Salir',
    outputExt: 'mp4',
  };
}

export function shouldOpenReelTrim(durationMs: number | null | undefined): boolean {
  return galleryNeedsTrim(durationMs);
}

export function trimSelectionMs(startTime: number, endTime: number): number {
  return Math.max(0, Number(endTime) - Number(startTime));
}

export function trimSelectionRejects(startTime: number, endTime: number): boolean {
  return trimSelectionMs(startTime, endTime) > REEL_TRIM_MAX_DURATION_MS;
}

export function applyTrimFinish(event: ReelTrimFinish): ReelTrimOutcome {
  const uri = String(event.outputPath || '').trim();
  if (!uri) return { status: 'error', message: 'El recorte no devolvió archivo.' };
  const fromRange =
    event.startTime != null && event.endTime != null
      ? trimSelectionMs(event.startTime, event.endTime)
      : null;
  const durationMs =
    event.duration != null && Number.isFinite(Number(event.duration))
      ? Number(event.duration)
      : fromRange;
  if (durationMs != null && durationMs > REEL_TRIM_MAX_DURATION_MS) {
    return { status: 'error', message: 'El recorte superó 30 segundos.' };
  }
  return { status: 'finished', uri, durationMs };
}

export function fileToUpload(originalUri: string | null, trimmedUri: string | null): string | null {
  return reelUploadSource({ originalUri, trimmedUri });
}

export function wouldUploadOriginalDespiteTrim(originalUri: string | null, trimmedUri: string | null): boolean {
  const src = fileToUpload(originalUri, trimmedUri);
  return !!(trimmedUri && src && src === originalUri && originalUri !== trimmedUri);
}

type TrimNative = {
  showEditor: (uri: string, cfg: object) => void;
  onFinishTrimming?: (cb: (e: ReelTrimFinish) => void) => { remove: () => void };
  onCancel?: (cb: () => void) => { remove: () => void };
  onError?: (cb: (e: { message?: string }) => void) => { remove: () => void };
};

export function openReelTrimEditor(videoUri: string, native: TrimNative): Promise<ReelTrimOutcome> {
  const cfg = reelTrimEditorConfig();
  return new Promise((resolve) => {
    const subs: Array<{ remove: () => void }> = [];
    const done = (out: ReelTrimOutcome) => {
      subs.forEach((s) => {
        try {
          s.remove();
        } catch {}
      });
      resolve(out);
    };
    if (native.onFinishTrimming) {
      subs.push(native.onFinishTrimming((e) => done(applyTrimFinish(e))));
    }
    if (native.onCancel) {
      subs.push(native.onCancel(() => done({ status: 'cancelled' })));
    }
    if (native.onError) {
      subs.push(native.onError((e) => done({ status: 'error', message: e?.message || 'No se pudo recortar.' })));
    }
    try {
      native.showEditor(videoUri, cfg);
    } catch (err: any) {
      done({ status: 'error', message: err?.message || 'El recorte nativo no está disponible en este build.' });
    }
  });
}

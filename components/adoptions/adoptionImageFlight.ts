// Apertura del muro al detalle, solo en el navegador.
// La miniatura no viaja a un hueco estimado: espera el rectángulo real
// y abre el recorte hasta la foto completa, sin un segundo salto.

import type { ApiAlert } from '../../lib/db';

export type FlightRect = { x: number; y: number; width: number; height: number };

const GRID_ASPECT = 4 / 5;
const OPEN_MS = 340;

type SourceWindow = { nx: number; ny: number; nw: number; nh: number };

type HeldFlight = {
  clip: HTMLDivElement;
  img: HTMLImageElement;
  from: FlightRect;
  fullUri: string;
  fullReady: boolean;
  moved: boolean;
  playing: boolean;
  returning: boolean;
  raf: number;
  safety: ReturnType<typeof setTimeout>;
  clipRect: FlightRect;
  imageRect: FlightRect | null;
  source: SourceWindow | null;
  onDone: (() => void) | null;
};

const thumbs = new Map<string, FlightRect>();
let stagedAlert: { id: string; alert: ApiAlert } | null = null;
let held: HeldFlight | null = null;
let dismissListener: (() => void) | null = null;

export function setHeldDismissListener(cb: (() => void) | null): void {
  dismissListener = cb;
}

export function stageAdoptionPreview(alert: ApiAlert): void {
  stagedAlert = { id: alert.id, alert };
}

export function peekAdoptionPreview(id: string): ApiAlert | null {
  return stagedAlert && stagedAlert.id === id ? stagedAlert.alert : null;
}

export function rememberAdoptionThumb(id: string, rect: FlightRect): void {
  if (rect.width < 8 || rect.height < 8) return;
  thumbs.set(id, rect);
}

export function adoptionThumbFrame(id: string): FlightRect | null {
  return thumbs.get(id) || null;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function heldAdoptionImageActive(): boolean {
  return !!held && !held.returning;
}

function sameRect(a: FlightRect, b: FlightRect): boolean {
  return Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRect(a: FlightRect, b: FlightRect, t: number): FlightRect {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    width: lerp(a.width, b.width, t),
    height: lerp(a.height, b.height, t),
  };
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Recorte que realmente muestra la parrilla: el archivo se pide cuadrado
 * y después `cover` lo mete en un cuadro 4:5. Esa ventana, no un cover
 * genérico, es el encuadre del primer fotograma.
 */
function gridSourceWindow(imageWidth: number, imageHeight: number): SourceWindow {
  const side = Math.min(imageWidth, imageHeight);
  const cropX = (imageWidth - side) / 2;
  const cropY = (imageHeight - side) / 2;
  const visW = side * GRID_ASPECT;
  const visH = side;
  const visX = cropX + (side - visW) / 2;
  return {
    nx: visX / imageWidth,
    ny: cropY / imageHeight,
    nw: visW / imageWidth,
    nh: visH / imageHeight,
  };
}

function imageRectFor(viewport: FlightRect, source: SourceWindow): FlightRect {
  const width = viewport.width / source.nw;
  const height = viewport.height / source.nh;
  return {
    x: viewport.x - source.nx * width,
    y: viewport.y - source.ny * height,
    width,
    height,
  };
}

function placeClip(flight: HeldFlight, rect: FlightRect, radius: number) {
  const style = flight.clip.style;
  style.left = `${rect.x}px`;
  style.top = `${rect.y}px`;
  style.width = `${rect.width}px`;
  style.height = `${rect.height}px`;
  style.borderRadius = `${radius}px`;
  flight.clipRect = rect;
}

function placeImage(flight: HeldFlight, clip: FlightRect, image: FlightRect) {
  const style = flight.img.style;
  style.position = 'absolute';
  style.objectFit = 'fill';
  style.left = `${image.x - clip.x}px`;
  style.top = `${image.y - clip.y}px`;
  style.width = `${image.width}px`;
  style.height = `${image.height}px`;
  flight.imageRect = image;
}

function dropHeld(callReveal: boolean) {
  const current = held;
  if (!current) return;
  clearTimeout(current.safety);
  cancelAnimationFrame(current.raf);
  current.clip.remove();
  held = null;
  if (callReveal) {
    current.onDone?.();
    dismissListener?.();
  }
}

function armSafety(flight: HeldFlight) {
  clearTimeout(flight.safety);
  flight.safety = setTimeout(() => {
    if (held === flight) dropHeld(true);
  }, 8000);
}

/**
 * Deja la miniatura exactamente encima de su celda.
 * No se mueve hasta conocer el rectángulo real del detalle.
 */
export function holdAdoptionImage(opts: { thumbUri: string; fullUri: string; from: FlightRect }): void {
  if (typeof document === 'undefined' || prefersReducedMotion() || !opts.thumbUri || !opts.from) return;
  dropHeld(false);
  const clip = document.createElement('div');
  const img = document.createElement('img');
  img.alt = '';
  img.src = opts.thumbUri;
  Object.assign(clip.style, {
    position: 'fixed',
    zIndex: '80',
    margin: '0',
    padding: '0',
    border: '0',
    overflow: 'hidden',
    pointerEvents: 'none',
    background: 'transparent',
  });
  Object.assign(img.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    margin: '0',
    padding: '0',
    border: '0',
  });
  clip.appendChild(img);
  document.body.appendChild(clip);
  const flight: HeldFlight = {
    clip,
    img,
    from: opts.from,
    fullUri: opts.fullUri,
    fullReady: false,
    moved: false,
    playing: false,
    returning: false,
    raf: 0,
    safety: setTimeout(() => undefined, 0),
    clipRect: opts.from,
    imageRect: null,
    source: null,
    onDone: null,
  };
  held = flight;
  placeClip(flight, opts.from, 10);
  armSafety(flight);
  if (opts.fullUri) {
    const preload = new Image();
    preload.onload = () => {
      if (held === flight) flight.fullReady = true;
    };
    preload.onerror = () => {
      if (held === flight) dropHeld(true);
    };
    preload.src = opts.fullUri;
    if (preload.complete && preload.naturalWidth > 0) flight.fullReady = true;
  }
}

function runMove(
  flight: HeldFlight,
  fromClip: FlightRect,
  toClip: FlightRect,
  fromImage: FlightRect,
  toImage: FlightRect,
  duration: number,
  radiusFrom: number,
  radiusTo: number,
  onEnd: () => void,
) {
  const started = performance.now();
  const frame = (now: number) => {
    if (held !== flight) return;
    const t = Math.min(1, (now - started) / duration);
    const e = easeOutCubic(t);
    const clip = lerpRect(fromClip, toClip, e);
    const image = lerpRect(fromImage, toImage, e);
    placeClip(flight, clip, lerp(radiusFrom, radiusTo, e));
    placeImage(flight, clip, image);
    if (t < 1) flight.raf = requestAnimationFrame(frame);
    else onEnd();
  };
  flight.raf = requestAnimationFrame(frame);
}

/**
 * Un solo movimiento: del recorte de la parrilla al rectángulo medido del detalle.
 * El archivo completo mantiene su proporción; se abre el encuadre, no se deforma.
 */
export function beginAdoptionOpen(opts: {
  to: FlightRect;
  imageWidth: number;
  imageHeight: number;
  onArrived?: () => void;
}): void {
  const flight = held;
  if (!flight || flight.playing || flight.returning) return;
  if (opts.imageWidth < 1 || opts.imageHeight < 1 || opts.to.width < 8 || opts.to.height < 8) return;
  flight.playing = true;
  flight.onDone = opts.onArrived || null;
  const start = () => {
    if (held !== flight || flight.returning) return;
    if (!flight.fullReady) {
      flight.raf = requestAnimationFrame(start);
      return;
    }
    flight.moved = true;
    const source = gridSourceWindow(opts.imageWidth, opts.imageHeight);
    flight.source = source;
    const fromImage = imageRectFor(flight.from, source);
    const toImage = opts.to;
    flight.img.src = flight.fullUri;
    placeClip(flight, flight.from, 10);
    placeImage(flight, flight.from, fromImage);
    armSafety(flight);
    runMove(flight, flight.from, opts.to, fromImage, toImage, OPEN_MS, 10, 0, () => {
      if (held !== flight || flight.returning) return;
      flight.onDone?.();
      flight.onDone = null;
    });
  };
  start();
}

/** Quita la foto temporal cuando la definitiva ya está pintada en el mismo rectángulo. */
export function finishHeldAdoptionImage(): void {
  if (!held || held.returning) return;
  dropHeld(false);
}

export function cancelHeldAdoptionImage(): void {
  if (!held || held.returning) return;
  dropHeld(true);
}

/** Si la apertura sigue en curso, la misma foto vuelve a la miniatura. */
export function returnHeldAdoptionImage(to: FlightRect): boolean {
  const flight = held;
  if (!flight) return false;
  flight.returning = true;
  flight.onDone = null;
  cancelAnimationFrame(flight.raf);
  if (!flight.moved || !flight.imageRect) {
    dropHeld(false);
    return true;
  }
  const fromClip = flight.clipRect;
  const fromImage = flight.imageRect;
  const source = flight.source ?? gridSourceWindow(Math.max(1, fromImage.width), Math.max(1, fromImage.height));
  const toImage = imageRectFor(to, source);
  runMove(flight, fromClip, to, fromImage, toImage, 240, 0, 10, () => {
    if (held === flight) dropHeld(false);
  });
  return true;
}

export function flyAdoptionImage(opts: {
  uri: string;
  from: FlightRect;
  to: FlightRect;
  fit?: 'cover' | 'contain';
  duration?: number;
}): Promise<void> {
  if (typeof document === 'undefined' || prefersReducedMotion() || !opts.uri) {
    return Promise.resolve();
  }
  const img = document.createElement('img');
  img.alt = '';
  img.src = opts.uri;
  const duration = opts.duration ?? 240;
  Object.assign(img.style, {
    position: 'fixed',
    zIndex: '80',
    margin: '0',
    padding: '0',
    border: '0',
    pointerEvents: 'none',
    objectFit: opts.fit || 'cover',
    borderRadius: '0px',
    left: `${opts.from.x}px`,
    top: `${opts.from.y}px`,
    width: `${opts.from.width}px`,
    height: `${opts.from.height}px`,
    transition: `left ${duration}ms ease, top ${duration}ms ease, width ${duration}ms ease, height ${duration}ms ease, border-radius ${duration}ms ease`,
  });
  document.body.appendChild(img);
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      img.remove();
      resolve();
    };
    requestAnimationFrame(() => {
      img.style.left = `${opts.to.x}px`;
      img.style.top = `${opts.to.y}px`;
      img.style.width = `${opts.to.width}px`;
      img.style.height = `${opts.to.height}px`;
      img.style.borderRadius = '10px';
    });
    img.addEventListener('transitionend', (event) => {
      if (event.propertyName === 'left' || event.propertyName === 'width') done();
    });
    setTimeout(done, duration + 50);
  });
}

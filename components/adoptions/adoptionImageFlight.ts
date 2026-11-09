// Transición visual del muro al detalle, solo en el navegador.
// La miniatura permanece en pantalla hasta que la foto del detalle ya
// está cargada. El regreso sigue achicándola hasta su celda.

import type { ApiAlert } from '../../lib/db';

export type FlightRect = { x: number; y: number; width: number; height: number };

type HeldFlight = {
  img: HTMLImageElement;
  generation: number;
  arrived: boolean;
  releasing: boolean;
  returning: boolean;
  onArrive: (() => void) | null;
  onReveal: (() => void) | null;
  safety: ReturnType<typeof setTimeout>;
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
  return Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2 && Math.abs(a.width - b.width) < 2 && Math.abs(a.height - b.height) < 2;
}

function place(img: HTMLImageElement, rect: FlightRect, radius: number) {
  img.style.left = `${rect.x}px`;
  img.style.top = `${rect.y}px`;
  img.style.width = `${rect.width}px`;
  img.style.height = `${rect.height}px`;
  img.style.borderRadius = `${radius}px`;
}

function dropHeld(callReveal: boolean) {
  const current = held;
  if (!current) return;
  clearTimeout(current.safety);
  current.img.remove();
  held = null;
  if (callReveal) {
    current.onReveal?.();
    dismissListener?.();
  }
}

/** La foto de la parrilla vuela y se queda hasta releaseHeldAdoptionImage. */
export function holdAdoptionImage(opts: {
  uri: string;
  from: FlightRect;
  to: FlightRect;
  duration?: number;
}): void {
  if (typeof document === 'undefined' || prefersReducedMotion() || !opts.uri) return;
  dropHeld(false);
  const img = document.createElement('img');
  img.alt = '';
  img.src = opts.uri;
  const duration = opts.duration ?? 280;
  Object.assign(img.style, {
    position: 'fixed',
    zIndex: '80',
    margin: '0',
    padding: '0',
    border: '0',
    pointerEvents: 'none',
    objectFit: 'cover',
    background: 'transparent',
    transition: `left ${duration}ms ease, top ${duration}ms ease, width ${duration}ms ease, height ${duration}ms ease, border-radius ${duration}ms ease`,
  });
  place(img, opts.from, 10);
  document.body.appendChild(img);
  const flight: HeldFlight = {
    img,
    generation: 1,
    arrived: false,
    releasing: false,
    returning: false,
    onArrive: null,
    onReveal: null,
    safety: setTimeout(() => dropHeld(true), 8000),
  };
  held = flight;
  const markArrived = (generation: number) => {
    if (held !== flight || flight.generation !== generation || flight.returning) return;
    flight.arrived = true;
    const arrive = flight.onArrive;
    flight.onArrive = null;
    arrive?.();
  };
  img.addEventListener('transitionend', (event) => {
    if (event.propertyName !== 'left' && event.propertyName !== 'width') return;
    markArrived(flight.generation);
  });
  img.addEventListener('error', () => {
    if (held === flight) dropHeld(true);
  });
  const openingGeneration = flight.generation;
  requestAnimationFrame(() => {
    if (held !== flight) return;
    place(img, opts.to, 0);
    if (sameRect(opts.from, opts.to)) markArrived(openingGeneration);
  });
  // Si el navegador no emite transitionend, la llegada igual queda registrada.
  // Esto no retira la foto: solo habilita la entrega cuando el detalle ya cargó.
  setTimeout(() => markArrived(openingGeneration), duration + 80);
}

/** Mueve la foto retenida al rectángulo real de la imagen del detalle. */
export function retargetHeldAdoptionImage(to: FlightRect): void {
  if (!held || held.releasing || held.returning) return;
  held.generation += 1;
  held.arrived = false;
  const generation = held.generation;
  const img = held.img;
  img.style.transition = 'left 160ms ease, top 160ms ease, width 160ms ease, height 160ms ease, border-radius 160ms ease';
  requestAnimationFrame(() => {
    if (held?.img !== img) return;
    place(img, to, 0);
  });
  setTimeout(() => {
    if (held?.img !== img || held.generation !== generation) return;
    held.arrived = true;
    const arrive = held.onArrive;
    held.onArrive = null;
    arrive?.();
  }, 200);
}

/**
 * Avisa que la foto definitiva ya puede mostrarse.
 * No la retira: el fundido ocurre después, cuando esa foto ya se pintó.
 */
export function releaseHeldAdoptionImage(onReveal?: () => void): void {
  if (!held || held.returning) {
    onReveal?.();
    return;
  }
  if (held.releasing) return;
  const flight = held;
  const reveal = () => {
    if (held !== flight || flight.returning || flight.releasing) return;
    flight.releasing = true;
    flight.onReveal = null;
    onReveal?.();
  };
  if (flight.arrived) reveal();
  else flight.onArrive = reveal;
}

/** Funde la foto temporal. Llamar después de pintar la imagen definitiva. */
export function fadeHeldAdoptionImage(): void {
  if (!held || held.returning) return;
  const flight = held;
  flight.releasing = true;
  flight.img.style.transition = 'opacity 140ms linear';
  flight.img.style.opacity = '0';
  const done = () => {
    if (held !== flight || flight.returning) return;
    dropHeld(false);
  };
  flight.img.addEventListener('transitionend', (event) => {
    if (event.propertyName === 'opacity') done();
  });
  setTimeout(done, 220);
}

export function cancelHeldAdoptionImage(): void {
  if (!held || held.returning) return;
  dropHeld(true);
}

/** Si la apertura sigue en curso, la misma foto vuelve a la miniatura. */
export function returnHeldAdoptionImage(to: FlightRect): boolean {
  if (!held) return false;
  const flight = held;
  flight.returning = true;
  flight.releasing = false;
  flight.onArrive = null;
  flight.onReveal = null;
  const img = flight.img;
  img.style.transition = 'left 240ms ease, top 240ms ease, width 240ms ease, height 240ms ease, border-radius 240ms ease, opacity 240ms ease';
  img.style.opacity = '1';
  img.style.objectFit = 'cover';
  requestAnimationFrame(() => {
    if (held !== flight) return;
    place(img, to, 10);
  });
  const done = () => {
    if (held === flight) dropHeld(false);
  };
  img.addEventListener('transitionend', (event) => {
    if (event.propertyName === 'left' || event.propertyName === 'width') done();
  });
  setTimeout(done, 320);
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

/** Primer destino, antes de medir la foto real del detalle. */
export function estimatedDetailFrame(): FlightRect {
  const width = Math.min(window.innerWidth, 880);
  return {
    x: Math.max(0, (window.innerWidth - width) / 2),
    y: 64,
    width,
    height: Math.min(width * 1.25, window.innerHeight * 0.72),
  };
}

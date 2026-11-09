// Transición visual del muro al detalle, solo en el navegador.
// La miniatura vuela hasta el hueco de la foto grande y, al volver,
// regresa a la celda. No cambia la navegación ni los archivos.

export type FlightRect = { x: number; y: number; width: number; height: number };

const thumbs = new Map<string, FlightRect>();
let flightUntil = 0;
let active: HTMLImageElement | null = null;

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

export function beginAdoptionFlight(ms = 280): void {
  flightUntil = Date.now() + ms;
}

export function adoptionFlightRemaining(): number {
  return Math.max(0, flightUntil - Date.now());
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
  active?.remove();
  const img = document.createElement('img');
  img.alt = '';
  img.src = opts.uri;
  const duration = opts.duration ?? 260;
  Object.assign(img.style, {
    position: 'fixed',
    zIndex: '80',
    margin: '0',
    padding: '0',
    border: '0',
    pointerEvents: 'none',
    objectFit: opts.fit || 'cover',
    left: `${opts.from.x}px`,
    top: `${opts.from.y}px`,
    width: `${opts.from.width}px`,
    height: `${opts.from.height}px`,
    transition: `left ${duration}ms ease, top ${duration}ms ease, width ${duration}ms ease, height ${duration}ms ease`,
  });
  document.body.appendChild(img);
  active = img;
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      if (active === img) active = null;
      img.remove();
      resolve();
    };
    requestAnimationFrame(() => {
      img.style.left = `${opts.to.x}px`;
      img.style.top = `${opts.to.y}px`;
      img.style.width = `${opts.to.width}px`;
      img.style.height = `${opts.to.height}px`;
    });
    img.addEventListener('transitionend', done, { once: true });
    setTimeout(done, duration + 50);
  });
}

/** Destino aproximado de la foto grande, antes de que el detalle mida la suya. */
export function estimatedDetailFrame(): FlightRect {
  const width = Math.min(window.innerWidth, 880);
  return {
    x: Math.max(0, (window.innerWidth - width) / 2),
    y: 72,
    width,
    height: Math.min(window.innerHeight * 0.58, width),
  };
}

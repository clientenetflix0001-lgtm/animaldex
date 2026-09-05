/** Icono QR del header principal (junto al logo). No es el QR de chapita. */

export const HEADER_QR_PREVIOUS_BUTTON = 32;
export const HEADER_QR_PREVIOUS_ICON = 22;
export const HEADER_QR_PREVIOUS_LOGO_GAP = 2;

export const HEADER_QR_ICON_SIZE = 32;
export const HEADER_QR_BUTTON_SIZE = 42;
export const HEADER_QR_HALO_SIZE = 68;
export const HEADER_QR_LOGO_GAP = 12;
export const HEADER_QR_HIT_SLOP = 10;

/** Azul eléctrico: contraste con el naranja Animaldex. */
export const HEADER_QR_HALO_COLOR = '#1E6CFF';
export const HEADER_QR_HALO_SOFT = 'rgba(30, 108, 255, 0.28)';

export const HEADER_QR_REST_MS = 4500;
export const HEADER_QR_FADE_MS = 320;
export const HEADER_QR_SPIN_MS = 1300;
export const HEADER_QR_PULSE_MS = 260;

export const HEADER_QR_ROUTE = 'QRScanner';
export const HEADER_QR_A11Y = 'Escanear código QR';

export function headerQrIsLargerThanBefore(): boolean {
  return HEADER_QR_BUTTON_SIZE > HEADER_QR_PREVIOUS_BUTTON && HEADER_QR_ICON_SIZE > HEADER_QR_PREVIOUS_ICON;
}

export function headerQrSeparatedFromLogo(): boolean {
  return HEADER_QR_LOGO_GAP > HEADER_QR_PREVIOUS_LOGO_GAP;
}

export function headerQrHaloIsDecorative(): boolean {
  return HEADER_QR_HALO_SIZE > HEADER_QR_BUTTON_SIZE;
}

export function headerQrCycleMs(): number {
  return HEADER_QR_REST_MS + HEADER_QR_FADE_MS + HEADER_QR_SPIN_MS + HEADER_QR_PULSE_MS + HEADER_QR_FADE_MS;
}

export function headerQrRestLongerThanSpin(): boolean {
  return HEADER_QR_REST_MS > HEADER_QR_SPIN_MS * 2;
}

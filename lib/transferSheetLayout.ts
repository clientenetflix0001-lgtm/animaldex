/** Extra visual, no la altura de una barra Samsung. El inset real viene del sistema. */
export const TRANSFER_SHEET_BOTTOM_EXTRA = 12;
export const TRANSFER_SHEET_BOTTOM_MIN = 20;
export const TRANSFER_SHEET_SCROLL_EXTRA = 16;

/** paddingBottom del sheet: inset real + espacio visual. */
export function transferSheetBottomPadding(insets: { bottom?: number } | null | undefined): number {
  const inset = Math.max(0, Number(insets?.bottom) || 0);
  return Math.max(inset + TRANSFER_SHEET_BOTTOM_EXTRA, TRANSFER_SHEET_BOTTOM_MIN);
}

export function transferSheetScrollPadding(): number {
  return TRANSFER_SHEET_SCROLL_EXTRA;
}

export function transferSheetUsesDeviceInset(): boolean {
  return true;
}

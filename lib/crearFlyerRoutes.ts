export const CREAR_FLYER_DRAFT_ROUTE = 'CreateFlyerDraft';
export const CREAR_FLYER_PREVIEW_ROUTE = 'CreateFlyerPreview';

export function nestedCrearRouteName(
  route?: { state?: { index?: number; routes?: Array<{ name?: string }> } } | null
): string | undefined {
  const st = route?.state;
  if (!st?.routes?.length) return undefined;
  return st.routes[st.index ?? 0]?.name;
}

export function shouldHideCrearTabBar(
  tabName: string | undefined,
  nestedName: string | undefined
): boolean {
  return tabName === 'Crear' && (nestedName === CREAR_FLYER_DRAFT_ROUTE || nestedName === CREAR_FLYER_PREVIEW_ROUTE);
}

export function isCrearFlyerRoute(name: string | undefined): boolean {
  return name === CREAR_FLYER_DRAFT_ROUTE || name === CREAR_FLYER_PREVIEW_ROUTE;
}

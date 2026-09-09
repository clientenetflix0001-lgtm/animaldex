/** Sube al navigator raíz (Root Stack). El Tab "Crear" no contiene CreateAlert. */
export function navigateRoot(
  navigation: { getParent?: () => unknown; navigate: (name: string, params?: object) => void },
  name: string,
  params?: object
): void {
  let nav: { getParent?: () => unknown; navigate: (name: string, params?: object) => void } = navigation;
  for (let i = 0; i < 8; i++) {
    const parent = nav.getParent?.() as typeof nav | undefined;
    if (!parent?.navigate) break;
    nav = parent;
  }
  nav.navigate(name, params);
}

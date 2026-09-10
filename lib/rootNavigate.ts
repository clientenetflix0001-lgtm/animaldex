type NavNode = {
  getParent?: () => unknown;
  getState?: () => { routeNames?: string[] } | undefined;
  navigate: (name: string, params?: object) => void;
};

/** Navega en el navigator que declara `name`. No subir más: el padre extra no es el native-stack. */
export function navigateRoot(
  navigation: NavNode,
  name: string,
  params?: object
): void {
  let nav: NavNode = navigation;
  for (let i = 0; i < 8; i++) {
    const names = nav.getState?.()?.routeNames;
    if (Array.isArray(names) && names.includes(name)) {
      nav.navigate(name, params);
      return;
    }
    const parent = nav.getParent?.() as NavNode | undefined;
    if (!parent?.navigate) break;
    nav = parent;
  }
  nav.navigate(name, params);
}

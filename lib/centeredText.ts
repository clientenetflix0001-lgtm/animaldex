/**
 * En Android, un Text dentro de `alignItems: 'center'` sin ancho propio
 * mide mal el wrap y recorta la última palabra de la línea siguiente.
 * Estirarlo al padre evita el clip sin numberOfLines ni ellipsis.
 */
export const centeredParentTextWrap = {
  alignSelf: 'stretch' as const,
  width: '100%' as const,
  flexShrink: 0,
};

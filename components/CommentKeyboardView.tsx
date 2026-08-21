import React, { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';

/**
 * Eleva el compositor de comentarios por encima del teclado.
 * En Android, `resize` no evita el solapamiento con status bar translúcida
 * (docs Expo); KeyboardAvoidingView con padding usa la altura real del IME.
 */
export function CommentKeyboardView({ children }: { children: ReactNode }) {
  const headerHeight = useHeaderHeight();
  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
      enabled={Platform.OS !== 'web'}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});

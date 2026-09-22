import React, { Component, type ErrorInfo, type ReactNode, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { flyerDebug } from '../lib/flyerDebug';
import { useAppTheme, type ThemeColors } from '../lib/theme';

function FlyerFlowFallback() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.box}>
      <Text style={styles.text}>No pudimos abrir el flyer. Volvé e intentá de nuevo.</Text>
    </View>
  );
}

export class FlyerFlowBoundary extends Component<{ children: ReactNode; route: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    void flyerDebug('FLYER_DEBUG_ERROR', { route: this.props.route, navigator: 'CrearStack' });
  }

  render() {
    if (this.state.failed) {
      return <FlyerFlowFallback />;
    }
    return this.props.children;
  }
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  text: { textAlign: 'center', fontWeight: '800', fontSize: 15, color: colors.text },
});
}

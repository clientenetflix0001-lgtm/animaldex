import React, { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, PanResponder } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReelTextOverlay } from '../lib/reelOverlays';
import { REEL_OVERLAY_SAFE, REEL_OVERLAY_TEXT_MAX, sanitizeOverlayText } from '../lib/reelOverlays';
import { colors, radius } from '../lib/theme';

const COLORS = ['#FFFFFF', '#2D2016', '#FF6B4A', '#2EC4B6', '#FFB800'];
const SIZES = [18, 22, 28];

type Props = {
  overlay: ReelTextOverlay;
  boxW: number;
  boxH: number;
  onChange: (next: ReelTextOverlay) => void;
  onRemove: () => void;
};

export function ReelTextEditor({ overlay, boxW, boxH, onChange, onRemove }: Props) {
  const [editing, setEditing] = useState(!overlay.text);
  const [draft, setDraft] = useState(overlay.text);
  const start = useRef({ x: overlay.x, y: overlay.y });

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !editing,
      onMoveShouldSetPanResponder: () => !editing,
      onPanResponderGrant: () => {
        start.current = { x: overlay.x, y: overlay.y };
      },
      onPanResponderMove: (_, g) => {
        if (!boxW || !boxH) return;
        const nx = Math.min(REEL_OVERLAY_SAFE.maxX, Math.max(REEL_OVERLAY_SAFE.minX, start.current.x + g.dx / boxW));
        const ny = Math.min(REEL_OVERLAY_SAFE.maxY, Math.max(REEL_OVERLAY_SAFE.minY, start.current.y + g.dy / boxH));
        onChange({ ...overlay, x: nx, y: ny });
      },
    })
  ).current;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <View
        {...pan.panHandlers}
        style={[
          styles.float,
          {
            left: overlay.x * boxW - 80,
            top: overlay.y * boxH - 18,
          },
        ]}
      >
        <Pressable onPress={() => setEditing(true)}>
          <Text
            style={{
              color: overlay.textColor,
              fontSize: overlay.fontSize,
              fontWeight: overlay.bold ? '800' : '700',
              backgroundColor: overlay.background === 'solid' ? 'rgba(0,0,0,0.55)' : 'transparent',
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {overlay.text || 'Texto'}
          </Text>
        </Pressable>
      </View>

      {editing ? (
        <View style={styles.sheet}>
          <TextInput
            value={draft}
            onChangeText={(t) => setDraft(t.slice(0, REEL_OVERLAY_TEXT_MAX))}
            placeholder="Escribí un texto"
            placeholderTextColor="#bbb"
            style={styles.input}
            autoFocus
            maxLength={REEL_OVERLAY_TEXT_MAX}
          />
          <View style={styles.row}>
            {COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => onChange({ ...overlay, textColor: c })}
                style={[styles.swatch, { backgroundColor: c }, overlay.textColor === c && styles.swatchOn]}
              />
            ))}
            {SIZES.map((s) => (
              <Pressable key={s} onPress={() => onChange({ ...overlay, fontSize: s })} style={styles.sizeBtn}>
                <Text style={{ color: '#fff', fontWeight: overlay.fontSize === s ? '800' : '600', fontSize: 12 }}>{s}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => onChange({ ...overlay, background: overlay.background === 'solid' ? 'none' : 'solid' })}
              style={styles.tool}
            >
              <Text style={styles.toolT}>{overlay.background === 'solid' ? 'Fondo' : 'Sin fondo'}</Text>
            </Pressable>
            <Pressable onPress={() => onChange({ ...overlay, bold: !overlay.bold })} style={styles.tool}>
              <Text style={[styles.toolT, { fontWeight: '800' }]}>N</Text>
            </Pressable>
          </View>
          <View style={styles.actions}>
            <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel="Eliminar texto">
              <Ionicons name="trash-outline" size={22} color="#fff" />
            </Pressable>
            <Pressable
              style={styles.ok}
              onPress={() => {
                const text = sanitizeOverlayText(draft);
                if (!text) {
                  onRemove();
                  return;
                }
                onChange({ ...overlay, text });
                setEditing(false);
              }}
            >
              <Text style={styles.okT}>Listo</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  float: { position: 'absolute', width: 160, alignItems: 'center' },
  sheet: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    backgroundColor: 'rgba(20,16,14,0.92)',
    borderRadius: radius.md,
    padding: 12,
  },
  input: { color: '#fff', fontSize: 16, minHeight: 40 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
  swatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: '#666' },
  swatchOn: { borderColor: colors.primary, borderWidth: 2 },
  sizeBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  tool: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#333' },
  toolT: { color: '#fff', fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  ok: { backgroundColor: colors.primary, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  okT: { color: '#fff', fontWeight: '800' },
});

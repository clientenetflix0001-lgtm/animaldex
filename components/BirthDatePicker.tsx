import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../lib/theme';
import { MONTHS, daysInMonth } from '../lib/birthDate';

type Field = 'day' | 'month' | 'year' | null;

export default function BirthDatePicker({
  year,
  month,
  day,
  onChange,
}: {
  year: number | null;
  month: number | null;
  day: number | null;
  onChange: (next: { year: number | null; month: number | null; day: number | null }) => void;
}) {
  const [open, setOpen] = useState<Field>(null);
  const now = new Date();
  const years = useMemo(() => {
    const list: number[] = [];
    for (let y = now.getFullYear(); y >= 1990; y--) list.push(y);
    return list;
  }, [now]);

  const maxDay = year && month ? daysInMonth(year, month) : 31;
  const days = useMemo(() => Array.from({ length: maxDay }, (_, i) => i + 1), [maxDay]);

  const pickYear = (y: number) => {
    const nextDay = day && month && day > daysInMonth(y, month) ? null : day;
    onChange({ year: y, month, day: nextDay });
    setOpen(null);
  };
  const pickMonth = (m: number) => {
    const nextDay = day && year && day > daysInMonth(year, m) ? null : day;
    onChange({ year, month: m, day: nextDay });
    setOpen(null);
  };
  const pickDay = (d: number) => {
    onChange({ year, month, day: d });
    setOpen(null);
  };

  const monthLabel = MONTHS.find((m) => m.n === month)?.label || 'Mes';
  const options =
    open === 'year' ? years : open === 'month' ? MONTHS.map((m) => m.n) : open === 'day' ? days : [];

  return (
    <View>
      <View style={styles.row}>
        <Pressable style={styles.box} onPress={() => setOpen('day')}>
          <Text style={[styles.value, !day && styles.placeholder]}>{day ? String(day) : 'Día'}</Text>
          <Text style={styles.arrow}>▼</Text>
        </Pressable>
        <Pressable style={[styles.box, { flex: 1.4 }]} onPress={() => setOpen('month')}>
          <Text style={[styles.value, !month && styles.placeholder]} numberOfLines={1}>
            {monthLabel}
          </Text>
          <Text style={styles.arrow}>▼</Text>
        </Pressable>
        <Pressable style={styles.box} onPress={() => setOpen('year')}>
          <Text style={[styles.value, !year && styles.placeholder]}>{year ? String(year) : 'Año'}</Text>
          <Text style={styles.arrow}>▼</Text>
        </Pressable>
      </View>
      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(null)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>
              {open === 'day' ? 'Día' : open === 'month' ? 'Mes' : 'Año'}
            </Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {open === 'month'
                ? MONTHS.map((m) => (
                    <Pressable
                      key={m.n}
                      style={[styles.option, month === m.n && styles.optionOn]}
                      onPress={() => pickMonth(m.n)}
                    >
                      <Text style={[styles.optionText, month === m.n && styles.optionTextOn]}>{m.label}</Text>
                    </Pressable>
                  ))
                : options.map((n) => (
                    <Pressable
                      key={n}
                      style={[
                        styles.option,
                        (open === 'day' ? day === n : year === n) && styles.optionOn,
                      ]}
                      onPress={() => (open === 'day' ? pickDay(n) : pickYear(n))}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          (open === 'day' ? day === n : year === n) && styles.optionTextOn,
                        ]}
                      >
                        {n}
                      </Text>
                    </Pressable>
                  ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  box: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 6,
  },
  value: { fontSize: 15, fontWeight: '700', color: colors.text, flex: 1 },
  placeholder: { color: colors.textMuted, fontWeight: '600' },
  arrow: { fontSize: 10, color: colors.textMuted },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  sheet: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    maxHeight: '80%',
  },
  sheetTitle: { fontWeight: '800', fontSize: 16, marginBottom: spacing.md, color: colors.text },
  option: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: radius.sm },
  optionOn: { backgroundColor: colors.primarysoft },
  optionText: { fontSize: 16, color: colors.text, fontWeight: '600' },
  optionTextOn: { color: colors.primary, fontWeight: '800' },
});

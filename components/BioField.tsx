import React, { useMemo } from 'react';
import { StyleSheet, Text, TextInput, type StyleProp, type TextStyle } from 'react-native';
import {
  BIO_WORD_LIMIT_ERROR,
  countBioWords,
  isBioWithinWordLimit,
  MAX_BIO_WORDS,
} from '../lib/bio';
import { useAppTheme, type ThemeColors } from '../lib/theme';

type Props = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: StyleProp<TextStyle>;
};

export default function BioField({ value, onChangeText, placeholder, style }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const words = countBioWords(value);
  const over = !isBioWithinWordLimit(value);
  return (
    <>
      <TextInput
        style={style}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline
        textAlignVertical="top"
      />
      <Text style={[styles.counter, over && styles.over]}>
        {words} / {MAX_BIO_WORDS} palabras
      </Text>
      {over ? <Text style={styles.error}>{BIO_WORD_LIMIT_ERROR}</Text> : null}
    </>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  counter: { marginTop: 6, fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  over: { color: colors.primary },
  error: { marginTop: 4, fontSize: 12, fontWeight: '700', color: colors.primary },
});
}

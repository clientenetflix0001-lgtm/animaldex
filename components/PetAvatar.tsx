import React, { memo } from 'react';
import { View, StyleSheet, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../lib/theme';
import { thumb } from '../lib/images';
import { petPhotoUri } from '../lib/petAvatar';

export const PET_AVATAR_PAW_ICON = 'paw' as const;

type Props = {
  uri?: string | null;
  size?: number;
  radius?: number;
  thumbWidth?: number;
  iconSize?: number;
  style?: StyleProp<ViewStyle | ImageStyle>;
  recyclingKey?: string;
  transition?: number;
  contentFit?: 'cover' | 'contain';
};

function pawSize(size?: number, iconSize?: number): number {
  if (iconSize) return iconSize;
  if (size) return Math.max(14, Math.round(size * 0.46));
  return 48;
}

function PetAvatarInner({
  uri,
  size,
  radius,
  thumbWidth,
  iconSize,
  style,
  recyclingKey,
  transition = 250,
  contentFit = 'cover',
}: Props) {
  const photo = petPhotoUri(uri);
  const dim = size != null ? { width: size, height: size } : undefined;
  const r = radius ?? (size != null ? size / 2 : undefined);
  const radiusStyle = r != null ? { borderRadius: r } : undefined;

  if (photo) {
    return (
      <Image
        source={{ uri: thumb(photo, thumbWidth ?? (size != null ? Math.max(80, size * 2) : 400)) }}
        style={[dim, radiusStyle, styles.photo, style]}
        contentFit={contentFit}
        transition={transition}
        recyclingKey={recyclingKey}
      />
    );
  }

  return (
    <View
      style={[dim, radiusStyle, styles.paw, style]}
      accessibilityRole="image"
      accessibilityLabel="Sin foto de mascota"
    >
      <Ionicons name={PET_AVATAR_PAW_ICON} size={pawSize(size, iconSize)} color={colors.primary} />
    </View>
  );
}

export default memo(PetAvatarInner);

const styles = StyleSheet.create({
  photo: {
    backgroundColor: colors.border,
  },
  paw: {
    backgroundColor: colors.primarysoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import Ionicons from '../AppIcon';
import type { ApiAlert } from '../../lib/db';
import { useAppTheme, type ThemeColors, radius, spacing } from '../../lib/theme';
import {
  adoptionAnalyticsSpecies,
  trackAdoptionShareCopied,
  trackAdoptionShareIntent,
  type Ga4ShareNetwork,
} from '../../lib/adoptionsAnalytics';
import {
  adoptionShareHeadline,
  adoptionShareTitle,
  adoptionShareTrackedUrl,
  adoptionWhatsappMessage,
  canUseWebShare,
  copyText,
  facebookSharerUrl,
  openExternal,
  shareViaWebApi,
  whatsappShareUrl,
} from '../../lib/adoptionsShare';

type Props = {
  alert: ApiAlert;
  citySlug: string;
};

export function AdoptionShareBar({ alert, citySlug }: Props) {
  const { colors, scheme } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors, scheme === 'dark'), [colors, scheme]);
  const [status, setStatus] = useState('');

  const headline = adoptionShareHeadline(alert);
  const title = adoptionShareTitle(alert);
  const waText = adoptionWhatsappMessage(alert);

  const note = useCallback((msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus((cur) => (cur === msg ? '' : cur)), 3200);
  }, []);

  const species = useMemo(() => adoptionAnalyticsSpecies(alert), [alert]);

  const trackIntent = useCallback(
    (shareNetwork: Ga4ShareNetwork) => {
      trackAdoptionShareIntent({
        adoptionId: alert.id,
        shareNetwork,
        species,
        city: citySlug,
      });
    },
    [alert.id, citySlug, species]
  );

  const trackCopied = useCallback(
    (shareNetwork: Ga4ShareNetwork) => {
      trackAdoptionShareCopied({
        adoptionId: alert.id,
        shareNetwork,
        species,
        city: citySlug,
      });
    },
    [alert.id, citySlug, species]
  );

  const onWhatsapp = useCallback(() => {
    const url = adoptionShareTrackedUrl(citySlug, alert.id, 'whatsapp');
    trackIntent('whatsapp');
    openExternal(whatsappShareUrl(waText, url));
  }, [alert.id, citySlug, trackIntent, waText]);

  const onFacebook = useCallback(() => {
    const url = adoptionShareTrackedUrl(citySlug, alert.id, 'facebook');
    trackIntent('facebook');
    openExternal(facebookSharerUrl(url));
  }, [alert.id, citySlug, trackIntent]);

  const onInstagram = useCallback(async () => {
    const url = adoptionShareTrackedUrl(citySlug, alert.id, 'instagram');
    trackIntent('instagram');
    if (canUseWebShare()) {
      const outcome = await shareViaWebApi(title, `${headline}\n${url}`, url);
      if (outcome === 'shared') {
        note('Elegí Instagram en el menú si está instalado. No se publica solo.');
        return;
      }
      if (outcome === 'copied') {
        trackCopied('instagram');
        note('Enlace copiado. Pegalo en Instagram: no hay publicación automática.');
        return;
      }
    }
    const copied = await copyText(url);
    if (copied) {
      trackCopied('instagram');
      note('Enlace copiado. Pegalo en Instagram: no hay publicación automática.');
    } else {
      note('Copiá el enlace y pegalo en Instagram. No se puede publicar desde la web.');
    }
  }, [alert.id, citySlug, headline, note, title, trackCopied, trackIntent]);

  const onMore = useCallback(async () => {
    const url = adoptionShareTrackedUrl(citySlug, alert.id, 'native');
    trackIntent(canUseWebShare() ? 'native' : 'copy_link');
    const outcome = await shareViaWebApi(title, waText, url);
    if (outcome === 'copied') {
      trackCopied('copy_link');
      note('Enlace copiado');
    } else if (outcome === 'shared') {
      note('Menú de compartir abierto');
    } else {
      const copied = await copyText(url);
      if (copied) {
        trackCopied('copy_link');
        note('Enlace copiado');
      }
    }
  }, [alert.id, citySlug, note, title, trackCopied, trackIntent, waText]);

  if (Platform.OS !== 'web') return null;

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <Text style={styles.headline}>{headline}</Text>
      <View style={styles.row}>
        <ShareIcon
          label="WhatsApp"
          color="#25D366"
          icon="logo-whatsapp"
          onPress={onWhatsapp}
        />
        <ShareIcon
          label="Facebook"
          color="#1877F2"
          icon="logo-facebook"
          onPress={onFacebook}
        />
        <ShareIcon
          label="Instagram"
          color="#E1306C"
          icon="logo-instagram"
          onPress={onInstagram}
        />
        <ShareIcon
          label="Más"
          color={colors.text}
          icon="share-outline"
          onPress={onMore}
          outline
        />
      </View>
      {status ? <Text style={styles.status}>{status}</Text> : null}
    </View>
  );
}

function ShareIcon({
  label,
  color,
  icon,
  onPress,
  outline,
}: {
  label: string;
  color: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  outline?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [stylesHit.btn, pressed && { opacity: 0.75 }]}
    >
      <View style={[stylesHit.circle, outline ? { borderWidth: 1.5, borderColor: color, backgroundColor: 'transparent' } : { backgroundColor: color }]}>
        <Ionicons name={icon} size={20} color={outline ? color : '#fff'} />
      </View>
    </Pressable>
  );
}

const stylesHit = StyleSheet.create({
  btn: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

function makeStyles(colors: ThemeColors, dark: boolean) {
  return StyleSheet.create({
    wrap: {
      marginTop: spacing.md,
      marginBottom: spacing.sm,
      paddingVertical: 10,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: dark ? 'rgba(255,255,255,0.06)' : '#FFF7F0',
      borderWidth: 1,
      borderColor: dark ? 'rgba(255,140,0,0.28)' : 'rgba(255,140,0,0.22)',
    },
    headline: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: 8,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 10,
    },
    status: {
      marginTop: 8,
      textAlign: 'center',
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 16,
    },
  });
}

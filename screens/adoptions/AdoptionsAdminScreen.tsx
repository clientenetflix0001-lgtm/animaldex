// ============================================================
// Animaldex Adopciones — panel privado de estadísticas.
// Sin enlace público. La autorización real está en el Worker.
// ============================================================
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Ionicons from '../../components/AppIcon';
import { db, type AdoptionsAnalyticsReport } from '../../lib/db';
import { useStore } from '../../lib/store';
import { useAppTheme, type ThemeColors, radius, spacing } from '../../lib/theme';
import { RootStackParamList } from '../../lib/types';
import { convertImage } from '../../lib/images';
import { ADOPTIONS_ANALYTICS_TZ } from '../../lib/adoptionsAnalytics';
import { adoptionDisplayName } from '../../lib/adoptionsShare';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'custom';

const RANGES: { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: 'yesterday', label: 'Ayer' },
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: 'month', label: 'Este mes' },
  { key: 'custom', label: 'Rango' },
];

const SOURCE_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  google: 'Google',
  other: 'Otros sitios',
  direct: 'Directo / desconocido',
};

const PAGE_LABEL: Record<string, string> = {
  catalog: 'Catálogo',
  locality: 'Localidad',
  post: 'Publicación',
  publish: 'Publicar',
  mine: 'Mis publicaciones',
  other: 'Otras rutas',
};

const DEVICE_LABEL: Record<string, string> = {
  mobile: 'Celular',
  desktop: 'Computadora',
  tablet: 'Tablet',
  unknown: 'Desconocido',
};

const NETWORK_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  native: 'Más / nativo',
  copy: 'Copiar enlace',
  other: 'Otros',
};

function fmt(n: number): string {
  return Number(n || 0).toLocaleString('es-AR');
}

function fmtUnique(n: number | null | undefined): string {
  if (n == null) return 'No disponible';
  return fmt(n);
}

function delta(current: number | null | undefined, previous: number | null | undefined): string {
  if (current == null) return 'no se puede deduplicar este período';
  if (previous == null) return 'sin período anterior comparable';
  if (previous <= 0 && current <= 0) return 'sin cambio';
  if (previous <= 0) return 'sin período anterior comparable';
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return 'igual al período anterior';
  return `${pct > 0 ? '+' : ''}${pct}% vs período anterior`;
}

function postLabel(post: AdoptionsAnalyticsReport['posts'][number]): string {
  const name = adoptionDisplayName(post);
  if (name) return name;
  if (post.mediaKind === 'flyer') return `Flyer · ${String(post.alertId).slice(-6)}`;
  return `Publicación · ${String(post.alertId).slice(-6)}`;
}

export default function AdoptionsAdminScreen() {
  const { colors, scheme } = useAppTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<Nav>();
  const { user } = useStore();
  const [range, setRange] = useState<RangeKey>('7d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState<AdoptionsAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    let el = document.querySelector('meta[name="robots"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('name', 'robots');
      document.head.appendChild(el);
    }
    el.setAttribute('content', 'noindex, nofollow');
    document.title = 'Estadísticas · Animaldex Adopciones';
  }, []);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (range === 'custom' && (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to))) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const res = await db.adoptionsAnalytics({
        range,
        from: range === 'custom' ? from : undefined,
        to: range === 'custom' ? to : undefined,
      });
      setData(res);
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status;
      const msg = e instanceof Error ? e.message : 'No se pudieron cargar las estadísticas';
      if (status === 401) setError('Iniciá sesión con un usuario administrador.');
      else if (status === 403) setError('Esta cuenta no está autorizada para ver estadísticas.');
      else setError(msg);
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [from, range, to, user]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  if (!user) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.gate}>
          <Text style={styles.title}>Estadísticas</Text>
          <Text style={styles.muted}>Panel privado de Animaldex Adopciones. Iniciá sesión con un administrador.</Text>
          <Pressable style={styles.primary} onPress={() => navigation.navigate('Auth', { mode: 'login' })}>
            <Text style={styles.primaryText}>Iniciar sesión</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const selected = data?.overview.selected;
  const previous = data?.overview.previous;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <Text style={styles.kicker}>Animaldex Adopciones</Text>
        <Text style={styles.title}>Estadísticas</Text>
        <Pressable onPress={() => navigation.navigate('AdoptionsWall', { city: 'saltacapital' })} hitSlop={8}>
          <Text style={styles.muted}>Volver al catálogo</Text>
        </Pressable>
        <Text style={styles.muted}>
          Zona horaria {ADOPTIONS_ANALYTICS_TZ}. Visitantes únicos y sesiones son estimaciones anónimas, no personas exactas.
        </Text>

        <View style={styles.chips}>
          {RANGES.map((r) => (
            <Pressable
              key={r.key}
              onPress={() => setRange(r.key)}
              style={[styles.chip, range === r.key && styles.chipOn]}
            >
              <Text style={[styles.chipText, range === r.key && styles.chipTextOn]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>
        {range === 'custom' ? (
          <View style={styles.customRow}>
            <TextInput value={from} onChangeText={setFrom} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} style={styles.input} />
            <TextInput value={to} onChangeText={setTo} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} style={styles.input} />
          </View>
        ) : null}

        {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {data && selected ? (
          <>
            {data.startedAt ? (
              <Text style={styles.muted}>
                Medición desde {new Date(data.startedAt).toLocaleString('es-AR', { timeZone: ADOPTIONS_ANALYTICS_TZ })}. No hay datos anteriores.
              </Text>
            ) : null}
            <Text style={styles.muted}>{data.note}</Text>

            <Text style={styles.section}>Resumen del período</Text>
            <View style={styles.grid}>
              <StatCard colors={colors} label="Páginas vistas" value={fmt(selected.pageViews)} hint={delta(selected.pageViews, previous?.pageViews || 0)} />
              <StatCard colors={colors} label="Visitantes únicos (est.)" value={fmtUnique(selected.uniqueVisitorsEstimated)} hint={delta(selected.uniqueVisitorsEstimated, previous?.uniqueVisitorsEstimated)} />
              <StatCard colors={colors} label="Sesiones (est.)" value={fmtUnique(selected.sessionsEstimated)} hint={delta(selected.sessionsEstimated, previous?.sessionsEstimated)} />
              <StatCard colors={colors} label="Intentos de compartir" value={fmt(selected.shareIntents)} hint={delta(selected.shareIntents, previous?.shareIntents || 0)} />
              <StatCard colors={colors} label="Enlaces copiados" value={fmt(selected.shareCopied)} />
              <StatCard colors={colors} label="Clics Quiero adoptarlo" value={fmt(selected.adoptClicks)} hint="No equivale a adopciones" />
            </View>

            <Text style={styles.section}>Totales fijos</Text>
            <View style={styles.grid}>
              <StatCard colors={colors} label="Hoy" value={fmt(data.overview.today.pageViews)} hint={`${fmtUnique(data.overview.today.uniqueVisitorsEstimated)} únicos est.`} />
              <StatCard colors={colors} label="Ayer" value={fmt(data.overview.yesterday.pageViews)} hint={`${fmtUnique(data.overview.yesterday.uniqueVisitorsEstimated)} únicos est.`} />
              <StatCard colors={colors} label="Últimos 7 días" value={fmt(data.overview.last7.pageViews)} hint={`${fmtUnique(data.overview.last7.uniqueVisitorsEstimated)} únicos est.`} />
              <StatCard colors={colors} label="Últimos 30 días" value={fmt(data.overview.last30.pageViews)} hint={`${fmtUnique(data.overview.last30.uniqueVisitorsEstimated)} únicos est.`} />
              <StatCard colors={colors} label="Semana calendario" value={fmt(data.overview.week.pageViews)} hint={`${fmtUnique(data.overview.week.uniqueVisitorsEstimated)} únicos est.`} />
              <StatCard colors={colors} label="Mes calendario" value={fmt(data.overview.month.pageViews)} hint={`${fmtUnique(data.overview.month.uniqueVisitorsEstimated)} únicos est.`} />
              <StatCard colors={colors} label="Histórico páginas vistas" value={fmt(data.overview.allTime.pageViews)} />
              <StatCard colors={colors} label="Histórico únicos (est.)" value={fmtUnique(data.overview.allTime.uniqueVisitorsEstimated)} hint="Hashes distintos desde el inicio, no una suma diaria" />
            </View>

            <Text style={styles.section}>Evolución diaria</Text>
            <BarChart data={data.daily} color={colors.primary} muted={colors.textMuted} text={colors.text} />

            <Text style={styles.section}>Páginas</Text>
            {data.pages.map((p) => (
              <Row key={p.key} left={`${PAGE_LABEL[p.kind] || p.kind}${p.locality ? ` · ${p.locality}` : ''}`} right={fmt(p.views)} colors={colors} />
            ))}

            <Text style={styles.section}>Publicaciones más vistas</Text>
            {data.posts.length === 0 ? <Text style={styles.muted}>Todavía no hay visitas a publicaciones.</Text> : null}
            {data.posts.map((p) => (
              <View key={p.alertId} style={styles.postRow}>
                {p.image ? (
                  <Image source={{ uri: convertImage(p.image, 96, 70, 'cover') }} style={styles.thumb} />
                ) : (
                  <View style={[styles.thumb, { alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name="paw" size={18} color={colors.textMuted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.postName}>{postLabel(p)}</Text>
                  <Text style={styles.muted}>{p.alertId}</Text>
                  <Text style={styles.muted}>
                    {fmt(p.views)} vistas · {fmt(p.shareIntents)} compartir · {fmt(p.adoptClicks)} quiero adoptarlo
                  </Text>
                </View>
              </View>
            ))}

            <Text style={styles.section}>Procedencia</Text>
            {data.sources.map((s) => (
              <Row key={s.source} left={SOURCE_LABEL[s.source] || s.source} right={`${fmt(s.pageViews)} vistas`} colors={colors} />
            ))}

            <Text style={styles.section}>Campañas UTM</Text>
            {data.campaigns.length === 0 ? <Text style={styles.muted}>Todavía no hay campañas con utm_campaign.</Text> : null}
            {data.campaigns.map((c) => (
              <Row
                key={`${c.campaign}-${c.source}-${c.medium}`}
                left={`${c.campaign} · ${c.source}/${c.medium}`}
                right={fmt(c.pageViews)}
                colors={colors}
              />
            ))}

            <Text style={styles.section}>Redes más usadas para difundir</Text>
            {data.networks.map((n) => (
              <Row
                key={n.network}
                left={NETWORK_LABEL[n.network] || n.network}
                right={`${fmt(n.shareIntents)} intentos · ${fmt(n.shareCopied)} copias`}
                colors={colors}
              />
            ))}

            <Text style={styles.section}>Dispositivos</Text>
            {rollDevices(data.devices).map((d) => (
              <Row key={d.device} left={DEVICE_LABEL[d.device] || d.device} right={fmt(d.pageViews)} colors={colors} />
            ))}
            <Text style={styles.muted}>Navegador y sistema (agregado)</Text>
            {data.devices.slice(0, 12).map((d) => (
              <Row key={`${d.device}-${d.browser}-${d.os}`} left={`${d.browser} · ${d.os}`} right={fmt(d.pageViews)} colors={colors} />
            ))}
          </>
        ) : null}
        <Text style={[styles.muted, { marginTop: 24 }]}>
          {scheme === 'dark' ? 'Modo oscuro' : 'Modo claro'} · sin índice en buscadores
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function rollDevices(rows: AdoptionsAnalyticsReport['devices']) {
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.device, (map.get(r.device) || 0) + r.pageViews);
  return [...map.entries()].map(([device, pageViews]) => ({ device, pageViews })).sort((a, b) => b.pageViews - a.pageViews);
}

function StatCard({
  colors,
  label,
  value,
  hint,
}: {
  colors: ThemeColors;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View style={{
      width: '48%',
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: radius.md,
      padding: 12,
      marginBottom: 10,
    }}>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 4 }}>{value}</Text>
      {hint ? <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>{hint}</Text> : null}
    </View>
  );
}

function Row({ left, right, colors }: { left: string; right: string; colors: ThemeColors }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.text, flex: 1 }}>{left}</Text>
      <Text style={{ color: colors.text, fontWeight: '700' }}>{right}</Text>
    </View>
  );
}

function BarChart({
  data,
  color,
  muted,
  text,
}: {
  data: AdoptionsAnalyticsReport['daily'];
  color: string;
  muted: string;
  text: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.pageViews));
  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 88, gap: 3 }}>
        {data.map((d) => (
          <View key={d.day} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
            <View style={{ width: '100%', maxWidth: 18, height: Math.max(2, (d.pageViews / max) * 80), backgroundColor: color, borderRadius: 3 }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <Text style={{ color: muted, fontSize: 11 }}>{data[0]?.day || ''}</Text>
        <Text style={{ color: text, fontSize: 11 }}>{fmt(max)} máx.</Text>
        <Text style={{ color: muted, fontSize: 11 }}>{data[data.length - 1]?.day || ''}</Text>
      </View>
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: spacing.lg, paddingBottom: 48, maxWidth: 920, width: '100%', alignSelf: 'center' },
    gate: { flex: 1, padding: spacing.xl, justifyContent: 'center', maxWidth: 420, alignSelf: 'center' },
    kicker: { color: colors.primary, fontWeight: '800', letterSpacing: 0.4, marginBottom: 4 },
    title: { color: colors.text, fontSize: 28, fontWeight: '800' },
    muted: { color: colors.textMuted, marginTop: 8, lineHeight: 20, fontSize: 13 },
    section: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 28, marginBottom: 8 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.full,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.card,
    },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { color: colors.text, fontWeight: '700', fontSize: 13 },
    chipTextOn: { color: '#111' },
    customRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: colors.text,
    },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    primary: { marginTop: 20, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
    primaryText: { color: '#111', fontWeight: '800' },
    error: { color: '#C62828', marginTop: 16 },
    postRow: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    thumb: { width: 56, height: 70, borderRadius: 8, backgroundColor: colors.card },
    postName: { color: colors.text, fontWeight: '700' },
  });
}

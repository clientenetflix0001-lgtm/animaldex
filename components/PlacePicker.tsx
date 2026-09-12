// ============================================================
// Animaldex — Selector de lugar normalizado.
// ============================================================
// Reemplaza a LocalityPicker. La diferencia que importa: acá el texto que
// escribe el usuario es SOLO una consulta de búsqueda. Nunca se persiste.
//
// No existe "Usar <lo que escribiste>", ni creación manual de localidades, ni
// forma alguna de guardar texto que no corresponda a un lugar del catálogo
// oficial. Si no hay coincidencias, no hay nada que elegir.
//
// GPS: coordenadas -> Worker /geo -> provincia y departamento oficiales ->
// candidatos del catálogo -> confirmación del usuario. La coordenada exacta no
// llega a esta pantalla y las distancias se muestran por tramos gruesos.
//
// CC BY 4.0: pie de atribución obligatorio, porque acá los datos de Georef se
// muestran al usuario por primera vez.
// ============================================================

import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GEO_ATTRIBUTION, coarseDistanceLabel, placeContextLabel } from '../lib/geoplace/format.ts';
import { searchPlaces } from '../lib/geoplace/catalog.ts';
import { resolveAdmin1Code } from '../lib/geoplace/aliases.ts';
import type { GeoCandidate, GeoPlace, PlaceResolution } from '../lib/geoplace/types.ts';
import { locateCurrentPlace, unambiguousPlace } from '../lib/placeLocate';
import { colors, radius, shadow, spacing } from '../lib/theme';

/** Payload de selección. Superconjunto del de LocalityPicker: `place` es lo nuevo. */
export type PlaceSelection = {
  /** Nombre oficial. Para mostrar y para los campos legacy. */
  locality: string;
  /** Nombre del nivel 1. En Argentina, la provincia. */
  province: string | null;
  /** Centroide público del lugar. NO es la posición del usuario. */
  lat: number | null;
  lon: number | null;
  /** El lugar normalizado. Es la identidad que se persiste desde Fase 3. */
  place: GeoPlace;
};

export function placeSelection(place: GeoPlace): PlaceSelection {
  return {
    locality: place.localityName,
    province: place.admin1Name || null,
    // Centroide del catálogo, no la coordenada del dispositivo.
    lat: place.centroidLat,
    lon: place.centroidLng,
    place,
  };
}

interface Props {
  visible: boolean;
  /** Nombre de nivel 1 conocido: acota la búsqueda sin impedir salir de él. */
  currentProvince?: string | null;
  onClose: () => void;
  onSelect: (selection: PlaceSelection) => void;
  title?: string;
  /** Muestra "Usar mi ubicación actual". */
  allowUseCurrentLocation?: boolean;
}

type Mode =
  | { kind: 'search' }
  /** Resultado del GPS esperando que el usuario confirme. */
  | { kind: 'confirm'; resolution: PlaceResolution }
  | { kind: 'locating' }
  | { kind: 'locate-error'; reason: 'permission-denied' | 'position-unavailable' };

const SEARCH_LIMIT = 20;

export function PlacePicker({
  visible,
  currentProvince,
  onClose,
  onSelect,
  title = 'Elegir ubicación',
  allowUseCurrentLocation = true,
}: Props) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<Mode>({ kind: 'search' });

  const provinceCode = useMemo(() => resolveAdmin1Code(currentProvince), [currentProvince]);

  // Búsqueda contra el catálogo embebido: instantánea, sin red, y funciona
  // igual si Georef está caído.
  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      // Sin consulta, se ofrecen los lugares de la provincia conocida.
      if (!provinceCode) return null;
      return searchPlaces('a', { admin1Code: provinceCode, limit: SEARCH_LIMIT });
    }
    // La provincia acota, pero si no hay nada dentro se busca en todo el país:
    // el usuario puede estar eligiendo una localidad de otra provincia.
    const scoped = provinceCode
      ? searchPlaces(trimmed, { admin1Code: provinceCode, limit: SEARCH_LIMIT })
      : null;
    if (scoped && scoped.matches.length) return scoped;
    return searchPlaces(trimmed, { limit: SEARCH_LIMIT });
  }, [query, provinceCode]);

  const reset = useCallback(() => {
    setQuery('');
    setMode({ kind: 'search' });
  }, []);

  const choose = useCallback(
    (place: GeoPlace) => {
      onSelect(placeSelection(place));
      reset();
      onClose();
    },
    [onSelect, onClose, reset]
  );

  const useCurrentLocation = useCallback(async () => {
    setMode({ kind: 'locating' });
    const res = await locateCurrentPlace();
    if (!res.ok) {
      setMode({ kind: 'locate-error', reason: res.reason });
      return;
    }
    // Sólo se preselecciona cuando el resolvedor dijo que no hay ambigüedad.
    // Con varios candidatos, la elección es del usuario.
    const only = unambiguousPlace(res);
    if (only) {
      choose(only);
      return;
    }
    setMode({ kind: 'confirm', resolution: res });
  }, [choose]);

  const close = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const renderCandidate = useCallback(
    ({ item }: { item: GeoCandidate }) => {
      const distance = coarseDistanceLabel(item.distanceKm);
      return (
        <Pressable style={styles.item} onPress={() => choose(item.place)}>
          <Ionicons
            name={item.withinResolvedArea ? 'location' : 'location-outline'}
            size={17}
            color={item.withinResolvedArea ? colors.primary : colors.textMuted}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.itemLocality}>{item.place.localityName}</Text>
            <Text style={styles.itemContext}>
              {/* El candidato de otro departamento va último aunque esté más
                  cerca, así que conviene decir por qué aparece. */}
              {item.withinResolvedArea
                ? placeContextLabel(item.place)
                : `${placeContextLabel(item.place)} · otro departamento`}
            </Text>
          </View>
          {distance ? <Text style={styles.itemDistance}>{distance}</Text> : null}
        </Pressable>
      );
    },
    [choose]
  );

  const body = () => {
    if (mode.kind === 'locating') {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.centeredText}>Buscando tu ubicación…</Text>
        </View>
      );
    }

    if (mode.kind === 'locate-error') {
      return (
        <View style={styles.centered}>
          <Ionicons name="location-outline" size={28} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>
            {mode.reason === 'permission-denied'
              ? 'No tenemos permiso de ubicación'
              : 'No pudimos obtener tu ubicación'}
          </Text>
          <Text style={styles.emptyHint}>Podés buscarla escribiendo el nombre.</Text>
          <Pressable style={styles.secondaryBtn} onPress={() => setMode({ kind: 'search' })}>
            <Text style={styles.secondaryBtnText}>Buscar por nombre</Text>
          </Pressable>
        </View>
      );
    }

    if (mode.kind === 'confirm') {
      const { resolution } = mode;
      const area = resolution.administrativeArea;
      return (
        <>
          <View style={styles.confirmHeader}>
            <Text style={styles.confirmTitle}>¿Cuál es tu localidad?</Text>
            <Text style={styles.confirmHint}>
              {area
                ? `Estás en ${area.admin2Name}, ${area.admin1Name}. Elegí la localidad exacta.`
                : 'No pudimos confirmar el área oficial. Elegí tu localidad de esta lista o buscala por nombre.'}
            </Text>
            {resolution.boundaryRisk ? (
              <Text style={styles.confirmWarn}>
                Estás cerca de un límite, así que puede haber más de una opción válida.
              </Text>
            ) : null}
          </View>
          <FlatList
            data={resolution.candidates}
            keyExtractor={(item) => item.place.placeId}
            renderItem={renderCandidate}
            contentContainerStyle={{ paddingBottom: spacing.md }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.emptyTitle}>No encontramos esa ubicación</Text>
                <Text style={styles.emptyHint}>Buscala escribiendo el nombre.</Text>
              </View>
            }
          />
          <Pressable style={styles.secondaryBtn} onPress={() => setMode({ kind: 'search' })}>
            <Text style={styles.secondaryBtnText}>Buscar otra ubicación</Text>
          </Pressable>
        </>
      );
    }

    const matches = results?.matches ?? [];
    const searching = !!query.trim();

    return (
      <>
        {results?.ambiguous && searching ? (
          <Text style={styles.ambiguousHint}>
            Hay más de una ubicación con ese nombre. Elegí la correcta.
          </Text>
        ) : null}
        <FlatList
          data={matches}
          keyExtractor={(item) => item.place.placeId}
          renderItem={({ item }) => (
            <Pressable style={styles.item} onPress={() => choose(item.place)}>
              <Ionicons name="location-outline" size={17} color={colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemLocality}>{item.place.localityName}</Text>
                <Text style={styles.itemContext}>{placeContextLabel(item.place)}</Text>
              </View>
            </Pressable>
          )}
          contentContainerStyle={{ paddingBottom: spacing.md }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            searching ? (
              // Sin coincidencias no hay nada que elegir. No se ofrece guardar
              // el texto escrito: eso es exactamente lo que Fase 3 elimina.
              <View style={styles.centered}>
                <Ionicons name="search" size={26} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>No encontramos esa ubicación</Text>
                <Text style={styles.emptyHint}>
                  Probá con otro nombre, sin la calle ni el número.
                </Text>
                <Pressable style={styles.secondaryBtn} onPress={() => setQuery('')}>
                  <Text style={styles.secondaryBtnText}>Intentar otra búsqueda</Text>
                </Pressable>
                {allowUseCurrentLocation ? (
                  <Pressable style={styles.secondaryBtn} onPress={useCurrentLocation}>
                    <Text style={styles.secondaryBtnText}>Usar mi ubicación actual</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={styles.centered}>
                <Text style={styles.emptyHint}>Escribí el nombre de la localidad.</Text>
              </View>
            )
          }
        />
      </>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.headerRow}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={close} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>

        {allowUseCurrentLocation && mode.kind === 'search' ? (
          <Pressable style={styles.currentLocBtn} onPress={useCurrentLocation}>
            <Ionicons name="locate" size={17} color={colors.primary} />
            <Text style={styles.currentLocText}>Usar mi ubicación actual</Text>
          </Pressable>
        ) : null}

        {mode.kind === 'search' ? (
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={17} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar localidad…"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
            />
          </View>
        ) : null}

        <View style={styles.bodyWrap}>{body()}</View>

        {/* CC BY 4.0. Obligatorio donde se muestran estos datos. */}
        <Text style={styles.attribution}>{GEO_ATTRIBUTION}</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '80%',
    ...shadow.card,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  currentLocBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primarysoft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: spacing.md,
  },
  currentLocText: { fontWeight: '700', fontSize: 14, color: colors.primary },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.text, paddingVertical: 11 },
  bodyWrap: { minHeight: 160, flexShrink: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemLocality: { fontSize: 14, fontWeight: '700', color: colors.text },
  itemContext: { fontSize: 12, color: colors.textMuted },
  itemDistance: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  ambiguousHint: {
    fontSize: 12,
    color: colors.text,
    backgroundColor: colors.primarysoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    marginBottom: spacing.sm,
    lineHeight: 17,
  },
  confirmHeader: { marginBottom: spacing.sm, gap: 4 },
  confirmTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  confirmHint: { fontSize: 12.5, color: colors.textMuted, lineHeight: 18 },
  confirmWarn: { fontSize: 12, color: colors.primary, fontWeight: '600', lineHeight: 17 },
  centered: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  centeredText: { fontSize: 13, color: colors.textMuted },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyHint: {
    fontSize: 12.5,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: spacing.lg,
  },
  secondaryBtn: {
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    marginTop: 4,
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  attribution: {
    fontSize: 10,
    lineHeight: 14,
    color: colors.textMuted,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});

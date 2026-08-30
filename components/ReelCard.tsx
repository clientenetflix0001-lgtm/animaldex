import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { ApiReel } from '../lib/db';
import {
  REEL_DOUBLE_TAP_MS,
  bufferSecondsForRole,
  displayedLikeCount,
  formatReelCount,
  ownerReelSurface,
  reelCaptionDisplay,
  resolveReelVideoTap,
  type ReelPlayerRole,
} from '../lib/reels';
import { parseReelOverlays } from '../lib/reelOverlays';
import { thumb, userFallbackAvatar } from '../lib/images';
import { colors } from '../lib/theme';
import ProfileBadge from '../features/profiles/ProfileBadge';
import { reelDevMark } from '../lib/reelDevTiming';
import { ReelOverlayLayer } from './ReelOverlayLayer';

interface Props {
  reel: ApiReel;
  role: ReelPlayerRole;
  shouldPlay: boolean;
  muted: boolean;
  liked: boolean;
  extraComments: number;
  isOwner: boolean;
  onToggleLike: (id: string) => void;
  onLikeOnly: (id: string) => void;
  onOpenComments: (reel: ApiReel) => void;
  onShare: (reel: ApiReel) => void;
  onOpenProfile: (reel: ApiReel) => void;
  onOpenPet: (reel: ApiReel) => void;
  onToggleMute: () => void;
  onDelete: (reel: ApiReel) => void;
}

function ReelCardInner({
  reel,
  role,
  shouldPlay,
  muted,
  liked,
  extraComments,
  isOwner,
  onToggleLike,
  onLikeOnly,
  onOpenComments,
  onShare,
  onOpenProfile,
  onOpenPet,
  onToggleMute,
  onDelete,
}: Props) {
  const [firstFrame, setFirstFrame] = useState(false);
  const [failed, setFailed] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [burst, setBurst] = useState(false);
  const lastTapRef = useRef<number | null>(null);
  const waitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burstRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const surface = ownerReelSurface(reel.status);
  const source = useMemo(() => {
    if (role === 'idle' || !reel.hlsUrl || surface !== 'ready') return null;
    return { uri: reel.hlsUrl, contentType: 'hls' as const };
  }, [role, reel.hlsUrl, surface]);

  const overlays = useMemo(() => parseReelOverlays(reel.overlays), [reel.overlays]);

  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = muted || role !== 'active';
    p.staysActiveInBackground = false;
    p.bufferOptions = {
      preferredForwardBufferDuration: bufferSecondsForRole(role),
      minBufferForPlayback: 1,
      prioritizeTimeOverSizeThreshold: true,
    };
  });

  useEffect(() => {
    player.muted = muted || role !== 'active';
  }, [player, muted, role]);

  useEffect(() => {
    if (role !== 'active') setUserPaused(false);
  }, [role, reel.id]);

  useEffect(() => {
    if (shouldPlay && role === 'active' && !userPaused && !failed && surface === 'ready') {
      try {
        player.play();
      } catch {
        setFailed(true);
      }
    } else {
      try {
        player.pause();
      } catch {}
    }
  }, [player, shouldPlay, role, userPaused, failed, surface]);

  useEffect(
    () => () => {
      if (waitRef.current) clearTimeout(waitRef.current);
      if (burstRef.current) clearTimeout(burstRef.current);
    },
    []
  );

  const retry = useCallback(() => {
    setFailed(false);
    setFirstFrame(false);
    if (reel.hlsUrl) {
      try {
        player.replace({ uri: reel.hlsUrl, contentType: 'hls' });
      } catch {
        setFailed(true);
      }
    }
  }, [player, reel.hlsUrl]);

  const onVideoPress = () => {
    if (role !== 'active' || surface !== 'ready') return;
    const now = Date.now();
    const { kind, nextLastTapAt } = resolveReelVideoTap({
      now,
      lastTapAt: lastTapRef.current,
      alreadyLiked: liked,
    });
    lastTapRef.current = nextLastTapAt;
    if (kind === 'wait') {
      if (waitRef.current) clearTimeout(waitRef.current);
      waitRef.current = setTimeout(() => {
        waitRef.current = null;
        lastTapRef.current = null;
        setUserPaused((p) => !p);
      }, REEL_DOUBLE_TAP_MS);
      return;
    }
    if (waitRef.current) {
      clearTimeout(waitRef.current);
      waitRef.current = null;
    }
    if (kind === 'double-like') {
      onLikeOnly(reel.id);
      setBurst(true);
      if (burstRef.current) clearTimeout(burstRef.current);
      burstRef.current = setTimeout(() => setBurst(false), 450);
    }
  };

  const confirmDelete = () => {
    Alert.alert('Eliminar Reel', 'Se va a eliminar este Reel. Esta acción no se puede deshacer.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar Reel', style: 'destructive', onPress: () => onDelete(reel) },
    ]);
  };

  const captionInfo = reelCaptionDisplay(reel.caption || '', showMore);
  const handle = reel.authorProfileUsername || reel.username;
  const orgType = reel.authorProfileType === 'business' || reel.authorProfileType === 'protector';
  const avatar = reel.authorProfileAvatar || userFallbackAvatar(handle || 'usuario');
  const comments = (reel.commentCount || 0) + extraComments;
  const likes = displayedLikeCount(reel.likeCount || 0, liked, reel.isLiked);
  const petHandle = reel.petUsername || reel.petName;
  const playing = shouldPlay && !userPaused && surface === 'ready';

  return (
    <View style={styles.root}>
      {reel.thumbnailUrl ? (
        <Image
          source={{ uri: reel.thumbnailUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          recyclingKey={reel.id}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111' }]} />
      )}

      {source ? (
        <VideoView
          player={player}
          style={[StyleSheet.absoluteFill, firstFrame ? styles.videoOn : styles.videoOff]}
          contentFit="cover"
          nativeControls={false}
          useExoShutter={false}
          onFirstFrameRender={() => {
            setFirstFrame(true);
            reelDevMark(reel.id, 'T5');
          }}
        />
      ) : null}

      <ReelOverlayLayer overlays={overlays} />

      {surface === 'processing' ? (
        <View style={styles.ownerState} pointerEvents="none">
          <ActivityIndicator color="#fff" />
          <Text style={styles.ownerStateT}>Procesando Reel…</Text>
        </View>
      ) : null}

      {surface === 'failed' && isOwner ? (
        <View style={styles.ownerState}>
          <Text style={styles.ownerStateT}>No pudimos procesar este Reel.</Text>
          <Pressable onPress={confirmDelete} style={styles.retry} accessibilityLabel="Eliminar Reel">
            <Text style={styles.retryText}>Eliminar</Text>
          </Pressable>
        </View>
      ) : null}

      {!firstFrame && role === 'active' && !failed && surface === 'ready' ? (
        <View style={styles.prepare} pointerEvents="none">
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}

      {failed && surface === 'ready' ? (
        <View style={styles.fail}>
          <Text style={styles.failText}>No se pudo reproducir</Text>
          <Pressable onPress={retry} style={styles.retry} accessibilityLabel="Reintentar">
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onVideoPress}
        accessibilityLabel={userPaused || !playing ? 'Reproducir' : 'Pausar'}
      />

      {userPaused && surface === 'ready' ? (
        <View style={styles.pauseBadge} pointerEvents="none">
          <Ionicons name="pause" size={28} color="#fff" />
        </View>
      ) : null}

      {burst ? (
        <View style={styles.burst} pointerEvents="none">
          <Ionicons name="heart" size={72} color={colors.heart} />
        </View>
      ) : null}

      <View style={styles.bottom} pointerEvents="box-none">
        <View style={styles.identity}>
          <Pressable onPress={() => onOpenProfile(reel)} hitSlop={8} accessibilityLabel="Abrir perfil">
            <Image source={{ uri: thumb(avatar, 80) }} style={styles.avatar} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Pressable onPress={() => onOpenProfile(reel)} accessibilityLabel={`Perfil de @${handle || 'usuario'}`}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>@{handle || 'usuario'}</Text>
                {orgType ? <ProfileBadge type={reel.authorProfileType} /> : null}
              </View>
            </Pressable>
            {petHandle ? (
              <Pressable onPress={() => onOpenPet(reel)} hitSlop={8} accessibilityLabel={`Mascota @${petHandle}`}>
                <Text style={styles.pet}>
                  {reel.petEmoji || '🐾'} @{petHandle}
                </Text>
              </Pressable>
            ) : null}
            {captionInfo.text ? (
              <Pressable
                onPress={() => captionInfo.showToggle && setShowMore((v) => !v)}
                accessibilityLabel={captionInfo.toggle === 'more' ? 'Ver más' : captionInfo.toggle === 'less' ? 'Ver menos' : 'Descripción'}
              >
                <Text style={styles.caption} numberOfLines={showMore ? 8 : undefined}>
                  {captionInfo.text}
                  {captionInfo.showToggle ? (
                    <Text style={styles.more}>{showMore ? '  Ver menos' : '  Ver más'}</Text>
                  ) : null}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <View style={styles.actions} pointerEvents="box-none">
        {isOwner ? (
          <Pressable onPress={confirmDelete} style={styles.action} hitSlop={10} accessibilityLabel="Más opciones">
            <Ionicons name="ellipsis-horizontal" size={26} color="#fff" />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => onToggleLike(reel.id)}
          style={styles.action}
          hitSlop={10}
          accessibilityLabel={liked ? 'Quitar me gusta' : 'Me gusta'}
        >
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={32} color={liked ? colors.heart : '#fff'} />
          <Text style={styles.actionN}>{formatReelCount(likes)}</Text>
        </Pressable>
        <Pressable
          onPress={() => onOpenComments(reel)}
          style={styles.action}
          hitSlop={10}
          accessibilityLabel="Comentarios"
        >
          <Ionicons name="chatbubble-outline" size={28} color="#fff" />
          <Text style={styles.actionN}>{formatReelCount(comments)}</Text>
        </Pressable>
        <Pressable onPress={() => onShare(reel)} style={styles.action} hitSlop={10} accessibilityLabel="Compartir">
          <Ionicons name="paper-plane-outline" size={28} color="#fff" />
          <Text style={styles.actionN}>Compartir</Text>
        </Pressable>
        <Pressable
          onPress={onToggleMute}
          style={styles.action}
          hitSlop={10}
          accessibilityLabel={muted ? 'Activar sonido' : 'Silenciar'}
        >
          <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={26} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

function sameReelCard(a: Props, b: Props) {
  return (
    a.reel.id === b.reel.id &&
    a.reel.hlsUrl === b.reel.hlsUrl &&
    a.reel.caption === b.reel.caption &&
    a.reel.status === b.reel.status &&
    a.reel.likeCount === b.reel.likeCount &&
    a.reel.commentCount === b.reel.commentCount &&
    a.reel.overlays === b.reel.overlays &&
    a.reel.petName === b.reel.petName &&
    a.reel.authorProfileUsername === b.reel.authorProfileUsername &&
    a.role === b.role &&
    a.shouldPlay === b.shouldPlay &&
    a.muted === b.muted &&
    a.liked === b.liked &&
    a.extraComments === b.extraComments &&
    a.isOwner === b.isOwner &&
    a.onToggleLike === b.onToggleLike &&
    a.onLikeOnly === b.onLikeOnly &&
    a.onOpenComments === b.onOpenComments &&
    a.onShare === b.onShare &&
    a.onOpenProfile === b.onOpenProfile &&
    a.onOpenPet === b.onOpenPet &&
    a.onToggleMute === b.onToggleMute &&
    a.onDelete === b.onDelete
  );
}

export const ReelCard = memo(ReelCardInner, sameReelCard);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  videoOn: { opacity: 1 },
  videoOff: { opacity: 0 },
  prepare: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  fail: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 10 },
  failText: { color: '#fff', fontWeight: '700' },
  retry: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  retryText: { color: '#fff', fontWeight: '800' },
  ownerState: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  ownerStateT: { color: '#fff', fontWeight: '800', textAlign: 'center', paddingHorizontal: 24 },
  pauseBadge: {
    position: 'absolute',
    alignSelf: 'center',
    top: '44%',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  burst: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 16, right: 88, bottom: 28 },
  identity: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#fff' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: '#fff', fontWeight: '800', fontSize: 15 },
  pet: { color: '#fff', fontWeight: '700', marginTop: 2 },
  caption: { color: '#fff', marginTop: 6, lineHeight: 18 },
  more: { color: '#ddd', fontWeight: '700' },
  actions: { position: 'absolute', right: 14, bottom: 32, alignItems: 'center', gap: 12 },
  action: { alignItems: 'center', minWidth: 48, minHeight: 48, justifyContent: 'center' },
  actionN: { color: '#fff', fontWeight: '700', marginTop: 2, fontSize: 11 },
});

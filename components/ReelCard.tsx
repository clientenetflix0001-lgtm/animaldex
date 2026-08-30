import React, { memo, useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useVideoPlayer, VideoView } from 'expo-video';
import type { ApiReel } from '../lib/db';
import { bufferSecondsForRole, type ReelPlayerRole } from '../lib/reels';
import { thumb, userFallbackAvatar } from '../lib/images';
import { colors } from '../lib/theme';
import ProfileBadge from '../features/profiles/ProfileBadge';

interface Props {
  reel: ApiReel;
  role: ReelPlayerRole;
  shouldPlay: boolean;
  muted: boolean;
  liked: boolean;
  extraComments: number;
  onToggleLike: (id: string) => void;
  onOpenComments: (reel: ApiReel) => void;
  onShare: (reel: ApiReel) => void;
  onOpenProfile: (reel: ApiReel) => void;
  onOpenPet: (reel: ApiReel) => void;
  onToggleMute: () => void;
}

function ReelCardInner({
  reel,
  role,
  shouldPlay,
  muted,
  liked,
  extraComments,
  onToggleLike,
  onOpenComments,
  onShare,
  onOpenProfile,
  onOpenPet,
  onToggleMute,
}: Props) {
  const [firstFrame, setFirstFrame] = useState(false);
  const [failed, setFailed] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const source =
    role !== 'idle' && reel.hlsUrl
      ? { uri: reel.hlsUrl, contentType: 'hls' as const }
      : null;

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
    if (shouldPlay && role === 'active' && !userPaused && !failed) {
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
  }, [player, shouldPlay, role, userPaused, failed]);

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

  const caption = reel.caption || '';
  const longCaption = caption.length > 90;
  const displayCaption = !longCaption || showMore ? caption : `${caption.slice(0, 90)}...`;
  const handle = reel.authorProfileUsername || reel.username;
  const orgType = reel.authorProfileType === 'business' || reel.authorProfileType === 'protector';
  const avatar = reel.authorProfileAvatar || userFallbackAvatar(handle || 'usuario');
  const comments = (reel.commentCount || 0) + extraComments;
  const likes = (reel.likeCount || 0) + (liked && !reel.isLiked ? 1 : 0);

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
          onFirstFrameRender={() => setFirstFrame(true)}
        />
      ) : null}

      {!firstFrame && role === 'active' && !failed ? (
        <View style={styles.prepare} pointerEvents="none">
          <ActivityIndicator color="#fff" />
        </View>
      ) : null}

      {failed ? (
        <View style={styles.fail}>
          <Text style={styles.failText}>No se pudo reproducir</Text>
          <Pressable onPress={retry} style={styles.retry}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => {
          if (role !== 'active') return;
          setUserPaused((p) => !p);
        }}
      />

      <View style={styles.bottom} pointerEvents="box-none">
        <Pressable style={styles.identity} onPress={() => onOpenProfile(reel)}>
          <Image source={{ uri: thumb(avatar, 80) }} style={styles.avatar} />
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>@{handle || 'usuario'}</Text>
              {orgType ? <ProfileBadge type={reel.authorProfileType} /> : null}
            </View>
            {reel.petName ? (
              <Pressable onPress={() => onOpenPet(reel)}>
                <Text style={styles.pet}>
                  {reel.petEmoji || '🐾'} {reel.petName}
                </Text>
              </Pressable>
            ) : null}
            {displayCaption ? (
              <Pressable onPress={() => longCaption && setShowMore((v) => !v)}>
                <Text style={styles.caption}>
                  {displayCaption}
                  {longCaption ? (
                    <Text style={styles.more}>{showMore ? '  ver menos' : '  ver más'}</Text>
                  ) : null}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </View>

      <View style={styles.actions} pointerEvents="box-none">
        <Pressable onPress={() => onToggleLike(reel.id)} style={styles.action}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={30} color={liked ? colors.heart : '#fff'} />
          <Text style={styles.actionN}>{likes}</Text>
        </Pressable>
        <Pressable onPress={() => onOpenComments(reel)} style={styles.action}>
          <Ionicons name="chatbubble-outline" size={26} color="#fff" />
          <Text style={styles.actionN}>{comments}</Text>
        </Pressable>
        <Pressable onPress={() => onShare(reel)} style={styles.action}>
          <Ionicons name="paper-plane-outline" size={26} color="#fff" />
        </Pressable>
        <Pressable onPress={onToggleMute} style={styles.action}>
          <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={26} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

export const ReelCard = memo(ReelCardInner);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000', overflow: 'hidden' },
  videoOn: { opacity: 1 },
  videoOff: { opacity: 0 },
  prepare: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  fail: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 10 },
  failText: { color: '#fff', fontWeight: '700' },
  retry: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  retryText: { color: '#fff', fontWeight: '800' },
  bottom: { position: 'absolute', left: 16, right: 76, bottom: 24 },
  identity: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#fff' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: '#fff', fontWeight: '800', fontSize: 15 },
  pet: { color: '#fff', fontWeight: '700', marginTop: 2 },
  caption: { color: '#fff', marginTop: 6, lineHeight: 18 },
  more: { color: '#ddd', fontWeight: '700' },
  actions: { position: 'absolute', right: 12, bottom: 28, alignItems: 'center', gap: 16 },
  action: { alignItems: 'center' },
  actionN: { color: '#fff', fontWeight: '700', marginTop: 2, fontSize: 12 },
});

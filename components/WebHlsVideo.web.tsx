import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { interpretPlayRejection, webHlsEngine, webReelVideoProps } from '../lib/reelWebPlayback';
import type { WebHlsVideoProps } from './WebHlsVideo';

export function WebHlsVideo({
  uri,
  shouldPlay,
  muted,
  onFirstFrame,
  onError,
  onAutoplayBlocked,
}: WebHlsVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const firstFrameRef = useRef(false);
  const onFirstFrameRef = useRef(onFirstFrame);
  const onErrorRef = useRef(onError);
  const onBlockedRef = useRef(onAutoplayBlocked);
  onFirstFrameRef.current = onFirstFrame;
  onErrorRef.current = onError;
  onBlockedRef.current = onAutoplayBlocked;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !uri) return;

    firstFrameRef.current = false;
    const props = webReelVideoProps({ muted: false, loop: true });
    video.loop = props.loop;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.preload = props.preload;
    video.crossOrigin = props.crossOrigin;
    video.controls = false;

    const engine = webHlsEngine((type) => video.canPlayType(type), Hls.isSupported());
    if (engine === 'none') {
      onErrorRef.current();
      return;
    }

    const markFrame = () => {
      if (firstFrameRef.current) return;
      firstFrameRef.current = true;
      onFirstFrameRef.current();
    };

    const onLoaded = () => markFrame();
    const onPlaying = () => markFrame();
    const onVideoError = () => onErrorRef.current();
    video.addEventListener('loadeddata', onLoaded);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('error', onVideoError);

    if (engine === 'native') {
      video.src = uri;
    } else {
      const hls = new Hls({
        enableWorker: true,
        maxBufferLength: 8,
        maxMaxBufferLength: 16,
        startLevel: -1,
      });
      hlsRef.current = hls;
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data?.fatal) onErrorRef.current();
      });
      hls.loadSource(uri);
      hls.attachMedia(video);
    }

    return () => {
      video.removeEventListener('loadeddata', onLoaded);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('error', onVideoError);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute('src');
      video.load();
    };
  }, [uri]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;

    const tryPlay = async () => {
      if (!shouldPlay) {
        video.pause();
        return;
      }
      try {
        await video.play();
      } catch (err) {
        const kind = interpretPlayRejection(err);
        if (kind === 'ignore') return;
        if (kind === 'retry-muted' && !video.muted) {
          video.muted = true;
          onBlockedRef.current();
          try {
            await video.play();
          } catch (retryErr) {
            if (interpretPlayRejection(retryErr) !== 'ignore') onErrorRef.current();
          }
        } else if (kind === 'fail') {
          onErrorRef.current();
        }
      }
    };
    void tryPlay();
  }, [shouldPlay, muted, uri]);

  return (
    <video
      ref={videoRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        backgroundColor: 'transparent',
      }}
      playsInline
      disablePictureInPicture
    />
  );
}

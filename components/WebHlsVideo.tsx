import React from 'react';

export type WebHlsVideoProps = {
  uri: string;
  shouldPlay: boolean;
  muted: boolean;
  onFirstFrame: () => void;
  onError: () => void;
  onAutoplayBlocked: () => void;
};

/** Stub nativo: el HLS web vive en WebHlsVideo.web.tsx. */
export function WebHlsVideo(_props: WebHlsVideoProps) {
  return null;
}

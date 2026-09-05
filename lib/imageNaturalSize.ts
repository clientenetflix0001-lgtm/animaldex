import { useEffect, useState } from 'react';
import { Image } from 'react-native';

/** Tamaño natural en cliente. No toca schema ni Worker (alerts no tienen image_w/h). */
export function useImageNaturalSize(uri?: string | null): { width: number; height: number } | null {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (!uri) {
      setSize(null);
      return;
    }
    let alive = true;
    setSize(null);
    Image.getSize(
      uri,
      (width, height) => {
        if (alive && width > 0 && height > 0) setSize({ width, height });
      },
      () => {}
    );
    return () => {
      alive = false;
    };
  }, [uri]);

  return size;
}

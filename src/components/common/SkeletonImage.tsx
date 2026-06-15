import { ReactNode, useEffect, useState } from 'react';
import {
  Image,
  ImageResizeMode,
  ImageStyle,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

import { radii } from '../../theme';
import { SkeletonBlock } from './UI';

type SkeletonImageProps = {
  uri?: string | null;
  style: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  fallback: ReactNode;
  skeletonRadius?: number;
  accessibilityLabel?: string;
};

// URIs that have decoded successfully at least once this session. React Native
// keeps the bitmap cached, so re-rendering or remounting a card (e.g. switching
// scan tabs) re-displays the image instantly. Without this, `loading` would flip
// back to true on every remount and flash the grey skeleton over the photo —
// the "images grey out when I switch tabs" bug.
const loadedUris = new Set<string>();

export function SkeletonImage({
  uri,
  style,
  resizeMode = 'cover',
  fallback,
  skeletonRadius = radii.md,
  accessibilityLabel,
}: SkeletonImageProps) {
  const [loaded, setLoaded] = useState(() => (uri ? loadedUris.has(uri) : false));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoaded(uri ? loadedUris.has(uri) : false);
    setFailed(false);
  }, [uri]);

  if (!uri || failed) {
    return <>{fallback}</>;
  }

  return (
    <View style={[styles.container, style as StyleProp<ViewStyle>]}>
      <Image
        source={{ uri }}
        resizeMode={resizeMode}
        accessibilityLabel={accessibilityLabel}
        style={[StyleSheet.absoluteFill, styles.image]}
        onLoad={() => {
          loadedUris.add(uri);
          setLoaded(true);
        }}
        onError={() => setFailed(true)}
      />
      {loaded ? null : (
        <SkeletonBlock
          width="100%"
          height="100%"
          radius={skeletonRadius}
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});

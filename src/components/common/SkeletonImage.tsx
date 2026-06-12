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

export function SkeletonImage({
  uri,
  style,
  resizeMode = 'cover',
  fallback,
  skeletonRadius = radii.md,
  accessibilityLabel,
}: SkeletonImageProps) {
  const [loading, setLoading] = useState(Boolean(uri));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoading(Boolean(uri));
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
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setFailed(true);
          setLoading(false);
        }}
      />
      {loading ? (
        <SkeletonBlock
          width="100%"
          height="100%"
          radius={skeletonRadius}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
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

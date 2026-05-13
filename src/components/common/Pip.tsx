import { Image, ImageResizeMode, ImageStyle, StyleProp } from 'react-native';

import { getPipAsset, PipState } from '../../theme';

type PipProps = {
  state: PipState;
  size?: number;
  style?: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  accessibilityLabel?: string;
};

export function Pip({
  state,
  size = 48,
  style,
  resizeMode = 'contain',
  accessibilityLabel = 'Pip mascot',
}: PipProps) {
  return (
    <Image
      source={getPipAsset(state)}
      style={[{ width: size, height: size }, style]}
      resizeMode={resizeMode}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    />
  );
}

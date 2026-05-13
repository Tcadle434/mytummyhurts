import { ImageSourcePropType } from 'react-native';

export type PipState =
  | 'base'
  | 'subtle'
  | 'thinking'
  | 'waving'
  | 'joy'
  | 'love'
  | 'thumbsUp'
  | 'anxious'
  | 'pain'
  | 'sleepy';

const pipAssets: Record<PipState, ImageSourcePropType> = {
  base: require('../../assets/pip/pip_base_transparent.png'),
  subtle: require('../../assets/pip/pip_subtle_transparent.png'),
  thinking: require('../../assets/pip/pip_thinking_transparent.png'),
  waving: require('../../assets/pip/pip_waving_transparent.png'),
  joy: require('../../assets/pip/pip_joyous_transparent.png'),
  love: require('../../assets/pip/pip_love_transparent.png'),
  thumbsUp: require('../../assets/pip/pip_thumbs_up_transparent.png'),
  anxious: require('../../assets/pip/pip_anxious_transparent.png'),
  pain: require('../../assets/pip/pip_pain_transparent.png'),
  sleepy: require('../../assets/pip/pip_sleepy_transparent.png'),
};

export const pipStates = Object.keys(pipAssets) as PipState[];

export function getPipAsset(state: PipState) {
  return pipAssets[state];
}

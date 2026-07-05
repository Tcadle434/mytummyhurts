import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { tokens, type } from '../../theme';
import { gutScoreTint } from '../../utils/risk';
import { dailyScoreBand } from '../../utils/weeklyProgress';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_SWEEP_DELAY = 160;
const RING_SWEEP_DURATION = 720;

type PayoffScoreRingProps = {
  score?: number;
  revealed: boolean;
  size?: number;
  strokeWidth?: number;
};

/**
 * The payoff moment's single score presentation, drawn on the warm hero
 * block: an animated ring sweep with the Bricolage hero numeral inside. The
 * stroke uses the band tint, the track is the raised-on-hero white, and the
 * numeral is always ink — band state is carried by the ring color, the band
 * phrase, and Pip's face.
 */
export function PayoffScoreRing({ score, revealed, size = 150, strokeWidth = 12 }: PayoffScoreRingProps) {
  const hasScore = typeof score === 'number';
  const clampedScore = Math.max(0, Math.min(100, score ?? 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!revealed || !hasScore) {
      return;
    }
    progress.value = withDelay(
      RING_SWEEP_DELAY,
      withTiming(clampedScore / 100, {
        duration: RING_SWEEP_DURATION,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [clampedScore, hasScore, progress, revealed]);

  const animatedRingProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const numeralColor = hasScore
    ? tokens.color.surface.hero.onHero
    : tokens.color.surface.hero.onHeroFaint;

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessible
      accessibilityLabel={
        hasScore
          ? `Daily Score ${clampedScore} out of 100, a ${dailyScoreBand(clampedScore)} day`
          : 'Daily Score pending'
      }
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={tokens.color.surface.hero.raised}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {hasScore ? (
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={gutScoreTint(clampedScore)}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            animatedProps={animatedRingProps}
            rotation="-90"
            origin={`${size / 2}, ${size / 2}`}
          />
        ) : null}
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <View style={styles.valueRow}>
          <Text style={[styles.value, { color: numeralColor }]}>{hasScore ? clampedScore : '—'}</Text>
          {hasScore ? <Text style={styles.unit}>%</Text> : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  value: {
    ...tokens.type.display.metric,
  },
  unit: {
    fontFamily: type.body.semibold,
    fontSize: 17,
    lineHeight: 23,
    paddingBottom: 5,
    marginLeft: 2,
    color: tokens.color.surface.hero.onHeroMuted,
  },
});

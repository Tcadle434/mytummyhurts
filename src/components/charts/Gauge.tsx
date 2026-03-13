import Svg, { Circle, G, Line } from 'react-native-svg';
import { Text, View } from 'react-native';

import { palette, type } from '../../theme';
import { RiskLevel } from '../../types/domain';

type GaugeProps = {
  score: number;
  label: RiskLevel;
};

export function Gauge({ score, label }: GaugeProps) {
  const radius = 64;
  const circumference = Math.PI * radius;
  const dashOffset = circumference - (circumference * score) / 100;
  const angle = -Math.PI + (Math.PI * score) / 100;
  const center = 82;
  const needleLength = 56;
  const endX = center + needleLength * Math.cos(angle);
  const endY = center + needleLength * Math.sin(angle);
  const tone = label === 'high' ? palette.high : label === 'medium' ? palette.medium : palette.low;

  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <Svg width={164} height={110}>
        <G rotation="180" origin={`${center}, ${center}`}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke="#E5E2D8"
            strokeWidth={16}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={0}
            strokeLinecap="round"
            fill="transparent"
          />
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={tone}
            strokeWidth={16}
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            fill="transparent"
          />
        </G>
        <Line x1={center} y1={center} x2={endX} y2={endY} stroke={palette.text} strokeWidth={4} strokeLinecap="round" />
        <Circle cx={center} cy={center} r={8} fill={palette.text} />
      </Svg>
      <Text style={{ color: palette.text, fontFamily: type.body.bold, fontSize: 38 }}>{score}</Text>
      <Text style={{ color: tone, fontFamily: type.body.semibold, fontSize: 14, textTransform: 'capitalize' }}>{label}</Text>
    </View>
  );
}

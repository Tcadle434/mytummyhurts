import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { components, radii, spacing, tokens, type } from '../../../theme';
import { Pip } from '../Pip';
import {
  CardVariant,
  InfoPillTone,
  getCardStyle,
  getPillStyle,
} from './shared';

type SectionCardProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: CardVariant;
};

type SkeletonBlockProps = {
  width?: number | `${number}%`;
  height: number | `${number}%`;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function SectionCard({ children, style, variant = 'default' }: SectionCardProps) {
  return <View style={[getCardStyle(variant), style]}>{children}</View>;
}

export function SkeletonBlock({ width = '100%', height, radius = radii.md, style }: SkeletonBlockProps) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[
        styles.skeletonBlock,
        {
          width,
          height,
          borderRadius: radius,
        },
        style,
      ]}
    />
  );
}

export function FrostedSection({ children, style }: SectionCardProps) {
  return (
    <View style={[styles.frostedCard, style]}>
      <LinearGradient colors={[tokens.color.surface.frosted, 'rgba(255,255,255,0.66)']} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

export function InfoPill({ label, tone = 'default' }: { label: string; tone?: InfoPillTone }) {
  const pillStyle = getPillStyle(tone);

  return (
    <View style={[styles.infoPill, { backgroundColor: pillStyle.backgroundColor }]}>
      <Text style={[styles.infoPillLabel, { color: pillStyle.color }]}>{label}</Text>
    </View>
  );
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailRowLabel}>{label}</Text>
      <Text style={styles.detailRowValue}>{value}</Text>
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricPill}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

export function PipAnalysisCard({ title = "Pip's take", body }: { title?: string; body: string }) {
  return (
    <View style={styles.pipCard}>
      <View style={styles.pipHeader}>
        <View style={styles.pipAvatarContainer}>
          <Pip state="subtle" size={42} />
        </View>
        <View style={styles.pipHeaderText}>
          <Text style={styles.pipTitle}>{title}</Text>
          <Text style={styles.pipSubtitle}>Personalized from your profile</Text>
        </View>
        <Ionicons name="sparkles" size={18} color={tokens.color.icon.accent} />
      </View>
      <Text style={styles.pipBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frostedCard: {
    ...components.card.frosted,
    overflow: 'hidden',
    padding: spacing.lg,
    gap: spacing.md,
  },
  skeletonBlock: {
    backgroundColor: tokens.color.chart.track,
    opacity: 0.7,
  },
  infoPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  infoPillLabel: {
    ...tokens.type.body.small,
    fontFamily: type.body.semibold,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  detailRowLabel: {
    ...tokens.type.body.default,
    flex: 1,
    color: tokens.color.text.tertiary,
  },
  detailRowValue: {
    ...tokens.type.body.strong,
    flex: 1,
    color: tokens.color.text.primary,
    textAlign: 'right',
  },
  divider: {
    height: 1,
    backgroundColor: tokens.color.border.strong,
  },
  metricPill: {
    minWidth: 92,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radii.md,
    backgroundColor: tokens.color.surface.card.default,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    gap: 2,
  },
  metricValue: {
    ...tokens.type.metric.value,
    color: tokens.color.text.primary,
  },
  metricLabel: {
    ...tokens.type.metric.label,
    color: tokens.color.text.tertiary,
  },
  pipCard: {
    ...components.card.success,
    padding: spacing.lg,
    gap: spacing.md,
  },
  pipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pipHeaderText: {
    flex: 1,
    gap: 2,
  },
  pipAvatarContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: tokens.color.status.success.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipTitle: {
    ...tokens.type.title.block,
    color: tokens.color.text.primary,
  },
  pipSubtitle: {
    ...tokens.type.body.small,
    color: tokens.color.text.tertiary,
  },
  pipBody: {
    ...tokens.type.body.emphasis,
    color: tokens.color.text.primary,
  },
});

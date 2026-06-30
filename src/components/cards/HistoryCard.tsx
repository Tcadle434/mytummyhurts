import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SkeletonImage } from '../common/SkeletonImage';
import { SkeletonBlock } from '../common/UI';
import { components, palette, spacing, type } from '../../theme';
import { ScanHistorySummary } from '../../types/domain';

type HistoryCardProps = {
  scan: ScanHistorySummary;
  onOpen: () => void;
};

export function HistoryCard({ scan, onOpen }: HistoryCardProps) {
  const tone = scan.overallRiskLevel === 'high' ? palette.high : scan.overallRiskLevel === 'medium' ? palette.medium : palette.low;
  const title = scan.dishName?.trim() || 'Meal scan';
  const metaLine = `${categoryLabel(scan.scanCategory)} • ${sourceLabel(scan.sourceType)} • ${formatTimestamp(scan.createdAt)}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${metaLine}, risk score ${scan.overallRiskScore}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.84 }]}
    >
      <View style={styles.leadingWrap}>
        <SkeletonImage
          uri={scan.imageUri}
          style={styles.thumb}
          resizeMode="cover"
          skeletonRadius={22}
          accessibilityLabel={`${title} photo`}
          fallback={<SkeletonBlock width={44} height={44} radius={22} />}
        />
      </View>

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {metaLine}
        </Text>
      </View>

      <View style={[styles.scoreRing, { borderColor: tone }]}>
        <Text style={[styles.scoreLabel, { color: tone }]}>{scan.overallRiskScore}</Text>
      </View>
    </Pressable>
  );
}

function categoryLabel(value: ScanHistorySummary['scanCategory']) {
  if (value === 'menu') return 'Menu';
  if (value === 'grocery') return 'Grocery';
  return 'Food';
}

function sourceLabel(value: ScanHistorySummary['sourceType']) {
  if (value === 'barcode') return 'Barcode';
  if (value === 'manual_text') return 'Text';
  if (value === 'upload' || value === 'manual_upload') return 'Upload';
  return 'Photo';
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  card: {
    ...components.card.default,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  leadingWrap: {
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  content: {
    flex: 1,
    gap: 3,
  },
  title: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 20,
    letterSpacing: -0.2,
  },
  subtitle: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 13,
  },
  scoreRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreLabel: {
    fontFamily: type.body.bold,
    fontSize: 21,
    letterSpacing: -0.4,
  },
});

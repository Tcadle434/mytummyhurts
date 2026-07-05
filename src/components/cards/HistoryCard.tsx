import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SkeletonImage } from '../common/SkeletonImage';
import { SkeletonBlock } from '../common/UI';
import { components, radii, spacing, tokens, type } from '../../theme';
import { ScanHistorySummary } from '../../types/domain';
import { riskLevelColors } from '../../utils/risk';

type HistoryCardProps = {
  scan: ScanHistorySummary;
  onOpen: () => void;
};

const THUMB_SIZE = 44;

export function HistoryCard({ scan, onOpen }: HistoryCardProps) {
  const tone = riskLevelColors(scan.overallRiskLevel);
  const title = scan.dishName?.trim() || 'Meal scan';
  const metaLine = `${formatTimestamp(scan.createdAt)} · ${sourceLabel(scan.sourceType)}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${scan.overallRiskLevel} risk, scanned at ${formatTimestamp(scan.createdAt)}`}
      onPress={onOpen}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.84 }]}
    >
      <View style={styles.leadingWrap}>
        <SkeletonImage
          uri={scan.imageUri}
          style={styles.thumb}
          resizeMode="cover"
          skeletonRadius={THUMB_SIZE / 2}
          accessibilityLabel={`${title} photo`}
          fallback={<SkeletonBlock width={THUMB_SIZE} height={THUMB_SIZE} radius={THUMB_SIZE / 2} />}
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

      <View style={[styles.riskPill, { backgroundColor: tone.background }]}>
        <Text style={[styles.riskPillText, { color: tone.foreground }]}>
          {scan.overallRiskLevel} risk
        </Text>
      </View>
    </Pressable>
  );
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
    width: THUMB_SIZE + spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
  },
  content: {
    flex: 1,
    gap: 3,
  },
  title: {
    ...tokens.type.body.strong,
    color: tokens.color.text.primary,
  },
  subtitle: {
    ...tokens.type.body.small,
    color: tokens.color.text.secondary,
  },
  riskPill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
  riskPillText: {
    ...tokens.type.label.tab,
    fontFamily: type.body.semibold,
  },
});

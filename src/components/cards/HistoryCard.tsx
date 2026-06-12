import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { SkeletonImage } from '../common/SkeletonImage';
import { components, palette, spacing, tokens, type } from '../../theme';
import { ScanHistorySummary } from '../../types/domain';

type HistoryCardProps = {
  scan: ScanHistorySummary;
  onOpen: () => void;
};

const STALE_ANALYSIS_MS = 10 * 60 * 1000;

export type HistoryScanDisplayStatus = 'completed' | 'analyzing' | 'failed';

// In-flight rows older than the longest possible analysis are orphans (the
// app was killed mid-scan); treat them like failures so they are removable.
export function historyScanDisplayStatus(scan: ScanHistorySummary, now = Date.now()): HistoryScanDisplayStatus {
  if (scan.analysisStatus === 'completed') {
    return 'completed';
  }

  if (scan.analysisStatus === 'failed') {
    return 'failed';
  }

  const startedAt = new Date(scan.createdAt).getTime();
  if (Number.isFinite(startedAt) && now - startedAt > STALE_ANALYSIS_MS) {
    return 'failed';
  }

  return 'analyzing';
}

export function HistoryCard({ scan, onOpen }: HistoryCardProps) {
  const status = historyScanDisplayStatus(scan);
  const tone = scan.overallRiskLevel === 'high' ? palette.high : scan.overallRiskLevel === 'medium' ? palette.medium : palette.low;
  const title = scan.dishName?.trim() || (status === 'completed' ? 'Meal scan' : 'Scan');
  const metaLine = `${categoryLabel(scan.scanCategory)} • ${sourceLabel(scan.sourceType)} • ${formatTimestamp(scan.createdAt)}`;

  return (
    <Pressable onPress={onOpen} style={({ pressed }) => [styles.card, pressed && { opacity: 0.84 }]}>
      <View style={styles.leadingWrap}>
        <SkeletonImage
          uri={scan.imageUri}
          style={styles.thumb}
          resizeMode="cover"
          skeletonRadius={22}
          accessibilityLabel={`${title} photo`}
          fallback={
            <View style={styles.placeholderThumb}>
              <Text style={styles.placeholderLabel}>{title.charAt(0).toUpperCase()}</Text>
            </View>
          }
        />
      </View>

      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text
          style={[styles.subtitle, status === 'failed' && styles.subtitleFailed]}
          numberOfLines={1}
        >
          {status === 'analyzing'
            ? `Analyzing… • ${metaLine}`
            : status === 'failed'
              ? `Didn't finish — tap to remove • ${metaLine}`
              : metaLine}
        </Text>
      </View>

      {status === 'analyzing' ? (
        <View style={styles.statusSlot}>
          <ActivityIndicator size="small" color={palette.textMuted} />
        </View>
      ) : status === 'failed' ? (
        <View style={styles.statusSlot}>
          <Ionicons name="alert-circle-outline" size={26} color={tokens.color.status.danger.foreground} />
        </View>
      ) : (
        <View style={[styles.scoreRing, { borderColor: tone }]}>
          <Text style={[styles.scoreLabel, { color: tone }]}>{scan.overallRiskScore}</Text>
        </View>
      )}
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
  statusSlot: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitleFailed: {
    color: tokens.color.status.danger.foreground,
  },
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
  placeholderThumb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.color.status.success.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderLabel: {
    color: palette.primaryDark,
    fontFamily: type.body.bold,
    fontSize: 18,
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

import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { components, palette, spacing, tokens, type } from '../../theme';
import { ScanRecord } from '../../types/domain';

type HistoryCardProps = {
  scan: ScanRecord;
  onOpen: () => void;
  onDelete?: () => void;
  deleteDisabled?: boolean;
  deleteLabel?: string;
};

export function HistoryCard({ scan, onOpen, onDelete, deleteDisabled, deleteLabel }: HistoryCardProps) {
  const tone = scan.overallRiskLevel === 'high' ? palette.high : scan.overallRiskLevel === 'medium' ? palette.medium : palette.low;

  return (
    <View style={styles.card}>
      <Pressable onPress={onOpen} style={({ pressed }) => [styles.openArea, pressed && { opacity: 0.84 }]}>
        <View style={styles.leadingWrap}>
          {scan.imageUri ? (
            <Image source={{ uri: scan.imageUri }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={styles.placeholderThumb}>
              <Text style={styles.placeholderLabel}>{scan.dishName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </View>

        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={1}>
            {scan.dishName}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {categoryLabel(scan.scanCategory)}
            {' • '}
            {sourceLabel(scan.sourceType)}
            {' • '}
            {formatTimestamp(scan.createdAt)}
          </Text>
        </View>

        <View style={[styles.scoreRing, { borderColor: tone }]}>
          <Text style={[styles.scoreLabel, { color: tone }]}>{scan.overallRiskScore}</Text>
        </View>
      </Pressable>

      {onDelete ? (
        <Pressable
          disabled={deleteDisabled}
          onPress={onDelete}
          style={({ pressed }) => [styles.deleteRow, (pressed || deleteDisabled) && { opacity: pressed ? 0.84 : 0.45 }]}
        >
          <Ionicons name="trash-outline" size={14} color={palette.danger} />
          <Text style={styles.deleteLabel}>{deleteLabel ?? 'Delete'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function categoryLabel(value: ScanRecord['scanCategory']) {
  if (value === 'menu') return 'Menu';
  if (value === 'grocery') return 'Grocery';
  return 'Food';
}

function sourceLabel(value: ScanRecord['sourceType']) {
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
    padding: spacing.md,
    gap: spacing.sm,
  },
  openArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
  deleteRow: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 2,
  },
  deleteLabel: {
    color: palette.danger,
    fontFamily: type.body.medium,
    fontSize: 13,
  },
});

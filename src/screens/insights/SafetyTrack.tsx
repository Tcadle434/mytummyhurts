import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SectionCard, verdictTone } from '../../components/common/UI';
import type { TriggerProfileEntry } from '../../features/insights/triggerGroups';
import { evidenceDetailForInsight, statusForInsight } from '../../features/insights/triggerProfile';
import { radii, spacing, tokens, type } from '../../theme';

// Families appear once on the board, so a "looking safe" family can contain
// members still waiting on evidence. The chip counts FOODS when coverage is
// partial ("2/6 calm") and days only when every member has calm evidence.
function safeChipBadge(entry: TriggerProfileEntry): { label: string; accessibility: string } {
  const total = entry.members.length;
  const calmFoods = entry.members.filter((member) => {
    const status = statusForInsight(member);
    return status === 'safe' || status === 'cleared';
  }).length;

  if (total > 1 && calmFoods < total) {
    return {
      label: `${calmFoods}/${total} calm`,
      accessibility: `${calmFoods} of ${total} foods calm so far`,
    };
  }
  const calmDays = entry.insight.positiveEvidenceCount;
  return {
    label: `${calmDays} calm`,
    accessibility: evidenceDetailForInsight(entry.insight, 'safe'),
  };
}

// The safety track deliberately breaks the case-file row silhouette (rule 1 +
// the Home alternation principle): cleared verdicts live in one tinted band —
// a settled shelf, not open cases — and looking-safe foods are a chip garden,
// glanceable and light. Risk keeps the detailed rows; safety earns brevity.

export function ClearedBand({
  entries,
  onOpen,
}: {
  entries: TriggerProfileEntry[];
  onOpen: (entry: TriggerProfileEntry) => void;
}) {
  const tone = verdictTone('cleared');
  return (
    <SectionCard style={[styles.clearedCard, { backgroundColor: tone.background }]}>
      <View style={styles.clearedHeader}>
        <Ionicons name="checkmark-circle" size={18} color={tone.foreground} />
        <Text style={[styles.clearedTitle, { color: tone.foreground }]}>Cleared</Text>
        <View style={styles.spacer} />
        <Text style={[styles.clearedCount, { color: tone.foreground }]}>{entries.length}</Text>
      </View>
      <Text style={[styles.clearedSubtitle, { color: tone.foreground }]}>
        Calm every time you ate them. You can stop worrying about these.
      </Text>
      <View style={styles.clearedList}>
        {entries.map((entry) => (
          <Pressable
            key={`${entry.kind}-${entry.key}`}
            accessibilityRole="button"
            accessibilityLabel={`${entry.label}, cleared. ${evidenceDetailForInsight(entry.insight, 'cleared')}`}
            onPress={() => onOpen(entry)}
            style={({ pressed }) => [styles.clearedRow, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.clearedEmoji}>{entry.emoji}</Text>
            <View style={styles.clearedCopy}>
              <Text style={styles.clearedName} numberOfLines={1}>
                {entry.label}
              </Text>
              <Text style={[styles.clearedEvidence, { color: tone.foreground }]} numberOfLines={1}>
                {evidenceDetailForInsight(entry.insight, 'cleared')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={tone.foreground} />
          </Pressable>
        ))}
      </View>
    </SectionCard>
  );
}

export function SafeChipGarden({
  entries,
  onOpen,
}: {
  entries: TriggerProfileEntry[];
  onOpen: (entry: TriggerProfileEntry) => void;
}) {
  const tone = verdictTone('safe');
  return (
    <View style={styles.safeBlock}>
      <View style={styles.safeHeader}>
        <Text style={[styles.safeTitle, { color: tone.foreground }]}>Looking safe</Text>
        <View style={styles.spacer} />
        <Text style={styles.safeCount}>{entries.length}</Text>
      </View>
      <Text style={styles.safeSubtitle}>Calm so far — a few more calm days each earns cleared.</Text>
      <View style={styles.chipWrap}>
        {entries.map((entry) => {
          const badge = safeChipBadge(entry);
          return (
            <Pressable
              key={`${entry.kind}-${entry.key}`}
              accessibilityRole="button"
              accessibilityLabel={`${entry.label}, looking safe. ${badge.accessibility}`}
              onPress={() => onOpen(entry)}
              style={({ pressed }) => [styles.chip, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.chipEmoji}>{entry.emoji}</Text>
              <Text style={styles.chipLabel} numberOfLines={1}>
                {entry.label}
              </Text>
              <View style={[styles.chipCount, { backgroundColor: tone.background }]}>
                <Text style={[styles.chipCountLabel, { color: tone.foreground }]}>
                  {badge.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  spacer: {
    flex: 1,
  },
  clearedCard: {
    gap: spacing.xs,
  },
  clearedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  clearedTitle: {
    ...tokens.type.title.block,
  },
  clearedCount: {
    fontFamily: type.body.bold,
    fontSize: 15,
    lineHeight: 19,
  },
  clearedSubtitle: {
    ...tokens.type.body.small,
    fontFamily: type.body.medium,
    opacity: 0.9,
  },
  clearedList: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  // Pure white rows on the tinted band — crisp against the cleared green,
  // no translucency.
  clearedRow: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: tokens.color.utility.white,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  clearedEmoji: {
    fontSize: 18,
  },
  clearedCopy: {
    flex: 1,
    gap: 1,
  },
  clearedName: {
    ...tokens.type.body.strong,
    color: tokens.color.text.primary,
  },
  clearedEvidence: {
    ...tokens.type.body.small,
    fontFamily: type.body.medium,
  },
  safeBlock: {
    gap: spacing.xs,
  },
  safeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  safeTitle: {
    ...tokens.type.label.eyebrow,
    fontFamily: type.body.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  safeCount: {
    color: tokens.color.text.tertiary,
    fontFamily: type.body.bold,
    fontSize: 13,
    lineHeight: 17,
  },
  safeSubtitle: {
    ...tokens.type.body.small,
    color: tokens.color.text.tertiary,
    paddingHorizontal: spacing.xs,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    maxWidth: '100%',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    backgroundColor: tokens.color.surface.card.default,
    paddingLeft: spacing.sm,
    paddingRight: 6,
    paddingVertical: 5,
    ...tokens.shadow.card,
  },
  chipEmoji: {
    fontSize: 15,
  },
  chipLabel: {
    ...tokens.type.body.small,
    fontFamily: type.body.semibold,
    color: tokens.color.text.primary,
    flexShrink: 1,
  },
  chipCount: {
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipCountLabel: {
    fontFamily: type.body.semibold,
    fontSize: 11,
    lineHeight: 14,
  },
});

import { StyleSheet, View } from 'react-native';

import { radii, spacing } from '../../theme';
import { SectionCard, SkeletonBlock } from '../common/UI';

// Mirrors the real result layout so the verdict area is anticipated before it
// loads: centered dish-name header, then the hero card — photo moment, level
// pill, verdict lines, Bricolage metric — then one evidence card.
export function ScanResultSkeleton() {
  return (
    <View style={styles.wrap}>
      <View style={styles.headerSkeleton}>
        <SkeletonBlock width={188} height={26} radius={radii.sm} />
        <SkeletonBlock width={132} height={15} radius={radii.sm} />
      </View>

      <SectionCard style={styles.heroCard}>
        <SkeletonBlock width="100%" height={176} radius={radii.lg} />
        <SkeletonBlock width={96} height={26} radius={radii.pill} />
        <SkeletonBlock width="92%" height={30} radius={radii.md} />
        <SkeletonBlock width="68%" height={30} radius={radii.md} />
        <SkeletonBlock width={124} height={46} radius={radii.md} />
      </SectionCard>

      <SectionCard style={styles.cardSkeleton}>
        <SkeletonBlock width={178} height={22} radius={radii.sm} />
        <SkeletonBlock width="82%" height={16} radius={radii.sm} />
        <SkeletonBlock width="68%" height={16} radius={radii.sm} />
      </SectionCard>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.lg,
  },
  headerSkeleton: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroCard: {
    gap: spacing.md,
  },
  cardSkeleton: {
    gap: spacing.md,
  },
});

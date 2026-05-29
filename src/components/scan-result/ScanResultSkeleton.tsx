import { StyleSheet, View } from 'react-native';

import { radii, spacing } from '../../theme';
import { SectionCard, SkeletonBlock } from '../common/UI';

export function ScanResultSkeleton() {
  return (
    <View style={styles.wrap}>
      <View style={styles.headerSkeleton}>
        <SkeletonBlock width={72} height={14} radius={radii.sm} />
        <SkeletonBlock width={168} height={30} radius={radii.sm} />
      </View>

      <View style={styles.heroRow}>
        <View style={styles.heroCopy}>
          <SkeletonBlock width="88%" height={34} radius={radii.md} />
          <SkeletonBlock width={138} height={17} radius={radii.sm} />
        </View>
        <SkeletonBlock width={104} height={104} radius={28} />
      </View>

      <SectionCard style={styles.riskCard}>
        <SkeletonBlock width={142} height={16} radius={radii.sm} />
        <View style={styles.riskRow}>
          <SkeletonBlock width={96} height={64} radius={radii.md} />
          <SkeletonBlock width={128} height={30} radius={radii.pill} />
        </View>
        <SkeletonBlock width="100%" height={18} radius={radii.pill} />
      </SectionCard>

      <SectionCard style={styles.cardSkeleton}>
        <SkeletonBlock width={178} height={26} radius={radii.sm} />
        <View style={styles.lineRow}>
          <SkeletonBlock width={78} height={16} radius={radii.sm} />
          <SkeletonBlock width="58%" height={14} radius={radii.pill} />
          <SkeletonBlock width={42} height={16} radius={radii.sm} />
        </View>
        <View style={styles.lineRow}>
          <SkeletonBlock width={92} height={16} radius={radii.sm} />
          <SkeletonBlock width="48%" height={14} radius={radii.pill} />
          <SkeletonBlock width={50} height={16} radius={radii.sm} />
        </View>
      </SectionCard>

      <SectionCard style={styles.cardSkeleton}>
        <SkeletonBlock width={132} height={26} radius={radii.sm} />
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
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  riskCard: {
    gap: spacing.md,
  },
  riskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  cardSkeleton: {
    gap: spacing.md,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});

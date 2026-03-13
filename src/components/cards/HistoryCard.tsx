import { StyleSheet, Text, View } from 'react-native';

import { createRiskTone } from '../../store/useAppStore';
import { palette, type } from '../../theme';
import { MealRecord, RiskLevel, ScanRecord } from '../../types/domain';
import { DetailRow, InfoPill, PrimaryButton, SectionCard, SecondaryButton } from '../common/UI';

type HistoryCardProps = {
  meal: MealRecord;
  scan?: ScanRecord;
  onOpen: () => void;
  onDidEat?: () => void;
  onDidNotEat?: () => void;
};

function describeState(meal: MealRecord, level?: RiskLevel) {
  if (meal.followupState === 'answered_no') {
    return 'Not eaten';
  }

  if (meal.didUserEat) {
    return 'Logged';
  }

  if (meal.followupState === 'pending') {
    return 'Awaiting follow-up';
  }

  return 'Saved';
}

export function HistoryCard({ meal, scan, onOpen, onDidEat, onDidNotEat }: HistoryCardProps) {
  const stateLabel = describeState(meal, scan?.overallRiskLevel);

  return (
    <SectionCard style={styles.card}>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={styles.title}>{meal.title}</Text>
          <Text style={styles.subtitle}>{new Date(meal.createdAt).toLocaleString()}</Text>
        </View>
        <InfoPill label={stateLabel} tone={meal.followupState === 'pending' ? 'soft' : 'default'} />
      </View>

      {scan ? (
        <>
          <DetailRow label="Risk" value={`${scan.overallRiskScore} • ${createRiskTone(scan.overallRiskLevel)}`} />
          {scan.possibleTriggers.length ? (
            <DetailRow label="Possible triggers" value={scan.possibleTriggers.slice(0, 3).join(', ')} />
          ) : null}
        </>
      ) : null}

      {meal.followupState === 'pending' ? (
        <View style={styles.actions}>
          {onDidEat ? <PrimaryButton label="Yes, I ate it" onPress={onDidEat} /> : null}
          {onDidNotEat ? <SecondaryButton label="No, I didn't" onPress={onDidNotEat} /> : null}
        </View>
      ) : (
        <SecondaryButton label="Open" onPress={onOpen} />
      )}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  title: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 17,
  },
  subtitle: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 13,
  },
  actions: {
    gap: 10,
  },
});

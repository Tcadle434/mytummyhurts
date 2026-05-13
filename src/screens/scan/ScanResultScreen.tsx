import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Image as RNImage, StyleSheet, Text, View } from 'react-native';

import { RiskBar } from '../../components/charts/RiskBar';
import { AppScreen, InfoPill, PipAnalysisCard, PrimaryButton, ScreenHeader, SectionCard, SecondaryButton } from '../../components/common/UI';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { selectLatestScan, useAppStore } from '../../store/useAppStore';
import { components, palette, radii, spacing, tokens, type } from '../../theme';
import { ExtractedIngredient, ScanRecord } from '../../types/domain';

type Props = NativeStackScreenProps<RootStackParamList, 'ScanResult'>;

const swapSuggestions: { match: string[]; label: string; detail: string }[] = [
  { match: ['dairy', 'cream', 'milk', 'cheese'], label: 'Lactose-free alternative', detail: 'Lower dairy load' },
  { match: ['garlic', 'onion'], label: 'Garlic-infused oil', detail: 'Flavor with lower fructan load' },
  { match: ['wheat', 'bread', 'pasta', 'noodle'], label: 'Gluten-free swap', detail: 'Lower wheat exposure' },
  { match: ['bean', 'lentil', 'chickpea'], label: 'Smaller portion or gentler base', detail: 'Lower fermentable load' },
];

export function ScanResultScreen({ navigation, route }: Props) {
  const scans = useAppStore((state) => state.scans);
  const profile = useAppStore((state) => state.profile);
  const finishOnboarding = useAppStore((state) => state.finishOnboarding);
  const [imageFailed, setImageFailed] = useState(false);

  const scan = selectLatestScan(scans, route.params.scanId);
  const visibleIngredients = useMemo(
    () => (scan ? dedupeIngredients(scan.structuredAnalysis.visibleIngredients) : []),
    [scan],
  );
  const inferredIngredients = useMemo(
    () => (scan ? dedupeIngredients(scan.structuredAnalysis.inferredIngredients) : []),
    [scan],
  );
  const allIngredientTokens = useMemo(
    () =>
      [
        ...(scan?.structuredAnalysis.visibleIngredients.map((ingredient) => ingredient.canonicalName) ?? []),
        ...(scan?.structuredAnalysis.inferredIngredients.map((ingredient) => ingredient.canonicalName) ?? []),
      ].map(normalizeToken),
    [scan],
  );
  const triggerLookup = useMemo(() => {
    const userSignals = [
      ...(profile?.knownIngredientSensitivities ?? []),
      ...(scan?.possibleTriggers ?? []),
    ].map(normalizeToken);
    return new Set(userSignals);
  }, [profile?.knownIngredientSensitivities, scan?.possibleTriggers]);
  const swapSuggestion = useMemo(() => (scan ? findSwapSuggestion(scan, visibleIngredients, inferredIngredients) : null), [scan, inferredIngredients, visibleIngredients]);
  const declaredMatches = useMemo(
    () =>
      (profile?.knownIngredientSensitivities ?? []).filter((item) => {
        const token = normalizeToken(item);
        return triggerLookup.has(token) || allIngredientTokens.some((ingredient) => ingredient.includes(token) || token.includes(ingredient));
      }),
    [allIngredientTokens, profile?.knownIngredientSensitivities, triggerLookup],
  );
  const topCondition = useMemo(
    () => Object.entries(scan?.conditionRiskScores ?? {}).sort((left, right) => right[1].score - left[1].score)[0],
    [scan?.conditionRiskScores],
  );
  const learnedMatches = useMemo(() => {
    const ingredientScores = profile?.stomachProfile.ingredientScores ?? {};
    return Object.entries(ingredientScores)
      .filter(([ingredientName, score]) => allIngredientTokens.includes(normalizeToken(ingredientName)) && score.evidenceCount > 0)
      .sort((left, right) => right[1].combinedRiskScore - left[1].combinedRiskScore);
  }, [allIngredientTokens, profile?.stomachProfile.ingredientScores]);
  const topLearnedMatch = learnedMatches[0];

  useEffect(() => {
    trackEvent('scan_result_viewed', { scan_id: route.params.scanId });
  }, [route.params.scanId]);

  useEffect(() => {
    setImageFailed(false);
  }, [scan?.id]);

  if (!scan) {
    return (
      <AppScreen>
        <ScreenHeader eyebrow="Missing scan" title="We couldn't find that result." subtitle="Try scanning the meal again." />
        <PrimaryButton label="Scan again" onPress={() => navigation.replace('ScanCapture', {})} />
      </AppScreen>
    );
  }

  function handleDone() {
    if (!scan) {
      return;
    }

    trackEvent('scan_result_dismissed', { scan_id: scan.id });

    if (route.params.fromOnboarding) {
      finishOnboarding();
    }

    navigation.reset({
      index: 0,
      routes: [{ name: 'MainTabs' }],
    });
  }

  const riskColor = toneForLevel(scan.overallRiskLevel);
  const riskSurface = surfaceForLevel(scan.overallRiskLevel);
  const riskLabel = scan.overallRiskLevel.charAt(0).toUpperCase() + scan.overallRiskLevel.slice(1);

  return (
    <AppScreen>
      <ScreenHeader eyebrow="Result" title="Scan result" />

      <View style={styles.heroRow}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>{scan.dishName}</Text>
          <Text style={styles.heroMeta}>{formatTimestamp(scan.createdAt)}</Text>
        </View>

        {scan.imageUri && !imageFailed ? (
          <RNImage source={{ uri: scan.imageUri }} style={styles.heroImage} resizeMode="cover" onError={() => setImageFailed(true)} />
        ) : (
          <ResultImageFallback title={scan.dishName} compact subtitle={imageFailed ? 'Photo unavailable' : undefined} />
        )}
      </View>

      <SectionCard style={[styles.riskCard, { backgroundColor: riskSurface.background, borderColor: riskSurface.border }]}>
        <Text style={styles.riskEyebrow}>Personalized risk</Text>
        <View style={styles.riskRow}>
          <Text style={[styles.riskWord, { color: riskColor }]}>{riskLabel}</Text>
          <View style={styles.riskScoreBlock}>
            <Text style={[styles.riskScore, { color: riskColor }]}>{scan.overallRiskScore}</Text>
            <Text style={styles.riskScale}>/100</Text>
          </View>
        </View>
      </SectionCard>

      {scan.gutScoreImpact ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>Gut Score impact</Text>
          <View style={styles.gutImpactRow}>
            <View>
              <Text style={styles.gutImpactLabel}>
                {scan.gutScoreImpact.direction === 'raise'
                  ? 'May support Gut Score'
                  : scan.gutScoreImpact.direction === 'lower'
                    ? 'May lower Gut Score'
                    : 'Likely neutral'}
              </Text>
              <Text style={styles.gutImpactSummary}>{scan.gutScoreImpact.summary}</Text>
            </View>
            <Text style={[styles.gutImpactDelta, { color: gutImpactTone(scan.gutScoreImpact.projectedDelta) }]}>
              {scan.gutScoreImpact.projectedDelta > 0 ? '+' : ''}
              {scan.gutScoreImpact.projectedDelta}
            </Text>
          </View>
          {scan.gutScoreImpact.projectedScore ? (
            <Text style={styles.gutImpactFootnote}>Projected score after eating: {scan.gutScoreImpact.projectedScore}/100</Text>
          ) : (
            <Text style={styles.gutImpactFootnote}>Daily reports help the app learn whether days like this felt calm or reactive.</Text>
          )}
        </SectionCard>
      ) : null}

      <SectionCard>
        <Text style={styles.sectionTitle}>Conditions impact</Text>
        <View style={styles.barList}>
          {Object.entries(scan.conditionRiskScores).map(([condition, risk]) => (
            <RiskBar key={condition} label={condition} score={risk.score} level={risk.level} />
          ))}
        </View>
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Why this score</Text>
        <View style={styles.metaStack}>
          <Text style={styles.metaLabel}>Declared profile</Text>
          <Text style={styles.metaValue}>
            {declaredMatches.length
              ? `Matched ${declaredMatches.slice(0, 2).join(', ')} from your declared sensitivities.`
              : 'No direct declared sensitivity match in this meal.'}
          </Text>
        </View>
        <View style={styles.metaStack}>
          <Text style={styles.metaLabel}>Known condition patterns</Text>
          <Text style={styles.metaValue}>
            {topCondition ? `${topCondition[0]} is the main driver at ${topCondition[1].score}/100.` : 'No strong condition-level signal yet.'}
          </Text>
        </View>
        <View style={styles.metaStack}>
          <Text style={styles.metaLabel}>Your learned outcomes</Text>
          <Text style={styles.metaValue}>
            {topLearnedMatch
              ? `${topLearnedMatch[0]} has ${topLearnedMatch[1].evidenceCount} daily report signal${topLearnedMatch[1].evidenceCount === 1 ? '' : 's'} in your profile.`
              : 'Keep logging food and daily reports to make future scores more personal.'}
          </Text>
        </View>
      </SectionCard>

      {scan.possibleTriggers.length ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>Likely triggers</Text>
          <View style={styles.chipWrap}>
            {scan.possibleTriggers.map((trigger) => (
              <InfoPill key={trigger} label={trigger} tone="warm" />
            ))}
          </View>
        </SectionCard>
      ) : null}

      {swapSuggestion ? (
        <SectionCard>
          <Text style={styles.sectionTitle}>Safer swap</Text>
          <View style={styles.swapCard}>
            <View style={styles.swapIcon}>
              <Ionicons name="leaf-outline" size={18} color={palette.primary} />
            </View>
            <View style={styles.swapCopy}>
              <Text style={styles.swapTitle}>{swapSuggestion.label}</Text>
              <Text style={styles.swapDetail}>{swapSuggestion.detail}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.primary} />
          </View>
        </SectionCard>
      ) : null}

      <SectionCard>
        <Text style={styles.sectionTitle}>Ingredients</Text>
        <View style={styles.ingredientList}>
          {visibleIngredients.map((ingredient) => (
            <IngredientRow key={`visible-${ingredient.canonicalName}`} ingredient={ingredient} triggerLookup={triggerLookup} visible />
          ))}
          {visibleIngredients.length === 0 ? (
            <Text style={styles.sectionBody}>No confident visible ingredients were extracted from the image.</Text>
          ) : null}
        </View>
        {inferredIngredients.length ? (
          <View style={styles.inferredWrap}>
            <Text style={styles.inferredLabel}>Likely inferred ingredients</Text>
            <View style={styles.chipWrap}>
              {inferredIngredients.map((ingredient) => (
                <InfoPill key={`inferred-${ingredient.canonicalName}`} label={ingredient.canonicalName} tone="soft" />
              ))}
            </View>
          </View>
        ) : null}
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>How it was recognized</Text>
        <View style={styles.metaStack}>
          <Text style={styles.metaLabel}>Preparation</Text>
          <Text style={styles.metaValue}>
            {scan.structuredAnalysis.prepStyle.length ? scan.structuredAnalysis.prepStyle.join(', ') : 'No strong preparation cues detected'}
          </Text>
        </View>
        {scan.structuredAnalysis.notes.length ? (
          <View style={styles.metaStack}>
            <Text style={styles.metaLabel}>Recognition notes</Text>
            <Text style={styles.metaValue}>{scan.structuredAnalysis.notes.join(', ')}</Text>
          </View>
        ) : null}
      </SectionCard>

      <PipAnalysisCard title="Pip's take" body={scan.interpretation} />

      <View style={styles.actionStack}>
        {route.params.manualMode ? (
          <PrimaryButton label="Done" onPress={handleDone} />
        ) : (
          <PrimaryButton label="Scan another" onPress={() => navigation.replace('ScanCapture', { sourceType: 'camera' })} />
        )}
        {route.params.manualMode ? null : <SecondaryButton label="Done" onPress={handleDone} />}
      </View>
    </AppScreen>
  );
}

function IngredientRow({
  ingredient,
  triggerLookup,
  visible,
}: {
  ingredient: ExtractedIngredient;
  triggerLookup: Set<string>;
  visible: boolean;
}) {
  const tone = determineIngredientTone(ingredient, triggerLookup);
  const toneColor =
    tone === 'high'
      ? tokens.color.status.risk.high.tint
      : tone === 'medium'
        ? tokens.color.status.risk.medium.tint
        : tokens.color.status.risk.low.tint;

  return (
    <View style={styles.ingredientRow}>
      <View style={[styles.ingredientDot, { backgroundColor: toneColor }]} />
      <View style={styles.ingredientCopy}>
        <Text style={styles.ingredientName}>{ingredient.canonicalName}</Text>
        <Text style={styles.ingredientMeta}>{visible ? 'Visible' : 'Inferred'}</Text>
      </View>
      <Text style={[styles.ingredientRisk, { color: toneColor }]}>{capitalize(tone)}</Text>
    </View>
  );
}

function dedupeIngredients(ingredients: ExtractedIngredient[]) {
  return Array.from(new Map(ingredients.map((ingredient) => [ingredient.canonicalName, ingredient])).values());
}

function determineIngredientTone(ingredient: ExtractedIngredient, triggerLookup: Set<string>) {
  const token = normalizeToken(ingredient.canonicalName);
  const component = normalizeToken(ingredient.component);
  const matchesTrigger = triggerLookup.has(token) || (component ? triggerLookup.has(component) : false);

  if (matchesTrigger) {
    return 'high';
  }

  if (ingredient.confidence === 'low' || ingredient.evidence === 'inferred') {
    return 'medium';
  }

  return 'low';
}

function normalizeToken(value?: string | null) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '') ?? '';
}

function findSwapSuggestion(scan: ScanRecord, visibleIngredients: ExtractedIngredient[], inferredIngredients: ExtractedIngredient[]) {
  const search = [
    ...scan.possibleTriggers,
    ...visibleIngredients.map((ingredient) => ingredient.canonicalName),
    ...inferredIngredients.map((ingredient) => ingredient.canonicalName),
  ].map(normalizeToken);

  return swapSuggestions.find((suggestion) => suggestion.match.some((match) => search.some((entry) => entry.includes(match))));
}

function toneForLevel(level: ScanRecord['overallRiskLevel']) {
  if (level === 'high') {
    return tokens.color.status.risk.high.tint;
  }

  if (level === 'medium') {
    return tokens.color.status.risk.medium.tint;
  }

  return tokens.color.status.risk.low.tint;
}

function surfaceForLevel(level: ScanRecord['overallRiskLevel']) {
  if (level === 'high') {
    return {
      background: tokens.color.status.risk.high.background,
      border: tokens.color.border.subtle,
    };
  }

  if (level === 'medium') {
    return {
      background: tokens.color.status.risk.medium.background,
      border: tokens.color.border.subtle,
    };
  }

  return {
    background: tokens.color.status.risk.low.background,
    border: tokens.color.border.subtle,
  };
}

function gutImpactTone(delta: number) {
  if (delta > 0) {
    return tokens.color.status.risk.low.tint;
  }

  if (delta < 0) {
    return tokens.color.status.risk.high.tint;
  }

  return tokens.color.text.secondary;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function ResultImageFallback({
  title,
  subtitle,
  compact = false,
}: {
  title: string;
  subtitle?: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.fallbackImage, compact && styles.fallbackImageCompact]}>
      <Text style={[styles.fallbackTitle, compact && styles.fallbackTitleCompact]}>{title.charAt(0).toUpperCase()}</Text>
      {subtitle ? <Text style={styles.fallbackSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  heroCopy: {
    flex: 1,
    gap: 6,
  },
  heroTitle: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.7,
  },
  heroMeta: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 15,
  },
  heroImage: {
    width: 104,
    height: 104,
    borderRadius: 28,
  },
  riskCard: {
    gap: spacing.sm,
  },
  riskEyebrow: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 15,
  },
  riskRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  riskWord: {
    fontFamily: type.body.bold,
    fontSize: 54,
    lineHeight: 58,
    letterSpacing: -1.4,
  },
  riskScoreBlock: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  riskScore: {
    fontFamily: type.body.bold,
    fontSize: 52,
    lineHeight: 56,
    letterSpacing: -1.2,
  },
  riskScale: {
    color: palette.textMuted,
    fontFamily: type.body.semibold,
    fontSize: 24,
    marginBottom: 8,
  },
  gutImpactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  gutImpactLabel: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 17,
  },
  gutImpactSummary: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  gutImpactDelta: {
    fontFamily: type.body.bold,
    fontSize: 34,
    letterSpacing: -0.8,
  },
  gutImpactFootnote: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 13,
    lineHeight: 18,
  },
  sectionTitle: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 22,
    letterSpacing: -0.4,
  },
  barList: {
    gap: spacing.md,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  swapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 62,
    borderRadius: radii.lg,
    backgroundColor: tokens.color.status.success.background,
    borderWidth: 1,
    borderColor: tokens.color.border.emphasis,
    paddingHorizontal: spacing.md,
  },
  swapIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: tokens.color.surface.card.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapCopy: {
    flex: 1,
    gap: 2,
  },
  swapTitle: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 16,
  },
  swapDetail: {
    color: palette.primary,
    fontFamily: type.body.medium,
    fontSize: 14,
  },
  ingredientList: {
    gap: spacing.sm,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ingredientDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  ingredientCopy: {
    flex: 1,
    gap: 1,
  },
  ingredientName: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 16,
    textTransform: 'capitalize',
  },
  ingredientMeta: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 13,
  },
  ingredientRisk: {
    fontFamily: type.body.semibold,
    fontSize: 15,
  },
  inferredWrap: {
    gap: spacing.sm,
  },
  inferredLabel: {
    color: palette.textMuted,
    fontFamily: type.body.semibold,
    fontSize: 14,
  },
  metaStack: {
    gap: 4,
  },
  metaLabel: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 14,
  },
  metaValue: {
    color: palette.text,
    fontFamily: type.body.medium,
    fontSize: 15,
    lineHeight: 22,
  },
  sectionBody: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  actionStack: {
    gap: spacing.sm,
  },
  fallbackImage: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 28,
    backgroundColor: components.profileMeter.centerBackground,
    paddingHorizontal: spacing.md,
    gap: 6,
  },
  fallbackImageCompact: {
    width: 104,
    height: 104,
  },
  fallbackTitle: {
    color: palette.primaryDark,
    fontFamily: type.body.bold,
    fontSize: 32,
  },
  fallbackTitleCompact: {
    fontSize: 40,
  },
  fallbackSubtitle: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 12,
    textAlign: 'center',
  },
});

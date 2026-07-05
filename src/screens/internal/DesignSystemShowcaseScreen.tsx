import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Gauge } from '../../components/charts/Gauge';
import { RiskBar } from '../../components/charts/RiskBar';
import {
  AppScreen,
  EvidenceMeter,
  GreenOutlineButton,
  HeroMetric,
  InfoPill,
  InputField,
  OptionChip,
  PrimaryButton,
  ScreenHeader,
  SectionCard,
  SecondaryButton,
  VerdictPill,
  type VerdictToneKey,
} from '../../components/common/UI';
import { Pip } from '../../components/common/Pip';
import { components, foundations, pipStates, tokens } from '../../theme';

const semanticSwatches = [
  { label: 'surface.app.default', value: tokens.color.surface.app.default, textColor: tokens.color.text.primary },
  { label: 'surface.card.default', value: tokens.color.surface.card.default, textColor: tokens.color.text.primary },
  { label: 'surface.card.warm', value: tokens.color.surface.card.warm, textColor: tokens.color.text.primary },
  { label: 'surface.hero.background', value: tokens.color.surface.hero.background, textColor: tokens.color.surface.hero.onHero },
  { label: 'surface.hero.deep', value: tokens.color.surface.hero.deep, textColor: tokens.color.surface.hero.onHero },
  { label: 'accent.brand', value: tokens.color.accent.brand, textColor: tokens.color.text.inverse },
  { label: 'info.background', value: tokens.color.info.background, textColor: tokens.color.info.foreground },
  { label: 'status.risk.low', value: tokens.color.status.risk.low.background, textColor: tokens.color.status.risk.low.foreground },
  { label: 'status.risk.medium', value: tokens.color.status.risk.medium.background, textColor: tokens.color.status.risk.medium.foreground },
  { label: 'status.risk.high', value: tokens.color.status.risk.high.background, textColor: tokens.color.status.risk.high.foreground },
  { label: 'status.danger', value: tokens.color.status.danger.background, textColor: tokens.color.status.danger.foreground },
] as const;

// The five verdict tones. Pills always pair `foreground` text with the tone
// background; `tint` only ever fills dots, meters, and rings.
const verdictTones: { tone: VerdictToneKey; label: string }[] = [
  { tone: 'confirmed', label: 'Confirmed' },
  { tone: 'suspect', label: 'Suspect' },
  { tone: 'watching', label: 'Watching' },
  { tone: 'safe', label: 'Safe' },
  { tone: 'cleared', label: 'Cleared' },
];

const foundationSwatches = [
  { label: 'brand.pip.base', value: foundations.color.brand.pip.base, textColor: tokens.color.text.primary },
  { label: 'brand.pip.accent', value: foundations.color.brand.pip.accent, textColor: tokens.color.text.primary },
  { label: 'brand.ink', value: foundations.color.brand.ink, textColor: tokens.color.text.inverse },
  { label: 'brand.canvas', value: foundations.color.brand.canvas, textColor: tokens.color.text.primary },
  { label: 'neutral.warm.0', value: foundations.color.neutral.warm[0], textColor: tokens.color.text.primary },
  { label: 'neutral.warm.50', value: foundations.color.neutral.warm[50], textColor: tokens.color.text.primary },
  { label: 'neutral.warm.100', value: foundations.color.neutral.warm[100], textColor: tokens.color.text.primary },
  { label: 'neutral.warm.200', value: foundations.color.neutral.warm[200], textColor: tokens.color.text.primary },
  { label: 'neutral.cool.600', value: foundations.color.neutral.cool[600], textColor: tokens.color.text.inverse },
  { label: 'neutral.cool.700', value: foundations.color.neutral.cool[700], textColor: tokens.color.text.inverse },
  { label: 'neutral.cool.800', value: foundations.color.neutral.cool[800], textColor: tokens.color.text.inverse },
  { label: 'brand.surface.default', value: foundations.color.brand.surface.default, textColor: tokens.color.text.primary },
  { label: 'brand.surface.warm', value: foundations.color.brand.surface.warm, textColor: tokens.color.text.primary },
  { label: 'brand.cta.scan', value: foundations.color.brand.cta.scan, textColor: tokens.color.text.inverse },
  { label: 'brand.info.blue', value: foundations.color.brand.info.blue, textColor: tokens.color.text.primary },
  { label: 'brand.status.red', value: foundations.color.brand.status.red, textColor: tokens.color.text.inverse },
  { label: 'brand.status.yellow', value: foundations.color.brand.status.yellow, textColor: tokens.color.text.primary },
  { label: 'brand.status.orange', value: foundations.color.brand.status.orange, textColor: tokens.color.text.primary },
  {
    label: 'brand.status.medium.bg',
    value: foundations.color.brand.status.mediumBackground,
    textColor: tokens.color.status.risk.medium.foreground,
  },
] as const;

const spaceTokens = Object.entries(tokens.space);
const radiusTokens = Object.entries(tokens.radius);

export function DesignSystemShowcaseScreen() {
  const [selectedChip, setSelectedChip] = useState<'profile' | 'scan'>('profile');
  const [inputValue, setInputValue] = useState('Turkey sandwich, no onion');

  return (
    <AppScreen>
      <ScreenHeader
        eyebrow="Internal"
        title="Design system showcase"
        subtitle="Every token and shared primitive should land here before it spreads through product screens."
      />

      <SectionCard>
        <Text style={styles.sectionTitle}>Foundations</Text>
        <Text style={styles.sectionBody}>
          Raw brand values live only in foundations. Feature code should consume semantic tokens and shared primitives instead.
        </Text>
        <View style={styles.swatchGrid}>
          {foundationSwatches.map((swatch) => (
            <Swatch key={swatch.label} label={swatch.label} value={swatch.value} textColor={swatch.textColor} />
          ))}
        </View>
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Semantic color tokens</Text>
        <View style={styles.swatchGrid}>
          {semanticSwatches.map((swatch) => (
            <Swatch key={swatch.label} label={swatch.label} value={swatch.value} textColor={swatch.textColor} />
          ))}
        </View>
      </SectionCard>

      <View style={styles.heroCard}>
        <Text style={styles.heroEyebrow}>SURFACE.HERO</Text>
        <Text style={styles.heroTitle}>The one warm hero block per screen</Text>
        <Text style={styles.heroBody}>
          Everything on it uses the on-hero ramp — onHero, onHeroMuted, onHeroFaint — so the hero can retint without touching screens.
        </Text>
        <HeroMetric
          value={82}
          color={tokens.color.surface.hero.onHero}
        />
        <Text style={styles.heroMuted}>onHeroMuted carries supporting copy.</Text>
        <Text style={styles.heroFaint}>onHeroFaint is for whispers and metadata.</Text>
        <View style={styles.heroRaisedChip}>
          <Text style={styles.heroRaisedChipLabel}>hero.raised chip</Text>
        </View>
      </View>

      <SectionCard>
        <Text style={styles.sectionTitle}>Verdict tones</Text>
        <Text style={styles.sectionBody}>
          Text on a tone background is always the darker foreground grade. Tints fill dots and meters only.
        </Text>
        <View style={styles.tokenRow}>
          {verdictTones.map(({ tone, label }) => (
            <VerdictPill key={tone} tone={tone} label={label} />
          ))}
        </View>
        <EvidenceMeter filled={2} total={3} label="2 of 3 calm days" tone="cleared" />
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Typography</Text>
        <Text style={styles.sectionBody}>
          Bricolage Grotesque owns anything with a voice — headlines, verdicts, numerals — and only via the display/title tokens. Figtree carries the quiet interface.
        </Text>
        <Text style={[styles.sampleText, tokens.type.display.hero]}>Display hero</Text>
        <Text style={[styles.sampleText, tokens.type.display.section]}>Display section</Text>
        <Text style={[styles.sampleText, tokens.type.display.accent]}>Display accent voices findings.</Text>
        <Text style={[styles.sampleText, tokens.type.display.metric]}>82</Text>
        <Text style={[styles.sampleText, tokens.type.title.screen]}>Screen title</Text>
        <Text style={[styles.sampleText, tokens.type.title.card]}>Card title</Text>
        <Text style={[styles.sampleText, tokens.type.title.block]}>Block title</Text>
        <Text style={[styles.sampleText, tokens.type.body.default]}>
          Body default is for normal copy. It should carry most paragraphs and explanatory text in the app.
        </Text>
        <Text style={[styles.sampleText, tokens.type.body.strong]}>Body strong is for emphasis without jumping to a heading.</Text>
        <Text style={[styles.sampleText, tokens.type.label.eyebrow]}>EYEBROW LABEL</Text>
        <Text style={[styles.sampleText, tokens.type.label.button]}>Button label</Text>
        <Text style={[styles.sampleText, tokens.type.label.chip]}>Chip label</Text>
        <Text style={[styles.sampleText, tokens.type.label.tab]}>Tab label</Text>
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Scales</Text>
        <Text style={styles.scaleLabel}>Spacing</Text>
        <View style={styles.tokenRow}>
          {spaceTokens.map(([key, value]) => (
            <TokenPill key={key} label={`${key} · ${value}`} />
          ))}
        </View>
        <Text style={styles.scaleLabel}>Radius</Text>
        <View style={styles.tokenRow}>
          {radiusTokens.map(([key, value]) => (
            <TokenPill key={key} label={`${key} · ${value}`} />
          ))}
        </View>
        <Text style={styles.scaleLabel}>Shadows</Text>
        <View style={styles.shadowRow}>
          <ShadowSample label="card" shadowStyle={tokens.shadow.card} />
          <ShadowSample label="lift" shadowStyle={tokens.shadow.lift} />
          <ShadowSample label="modal" shadowStyle={tokens.shadow.modal} />
        </View>
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Primitives</Text>
        <View style={styles.buttonStack}>
          <PrimaryButton label="Primary button" onPress={() => undefined} />
          <SecondaryButton label="Secondary button" onPress={() => undefined} />
          <GreenOutlineButton label="Quiet button" onPress={() => undefined} />
        </View>
        <View style={styles.cardPreviewStack}>
          <SectionCard style={styles.nestedCard}>
            <Text style={styles.cardLabel}>Default card</Text>
          </SectionCard>
          <SectionCard style={styles.nestedCard} variant="warm">
            <Text style={styles.cardLabel}>Warm card</Text>
          </SectionCard>
          <SectionCard style={styles.nestedCard} variant="success">
            <Text style={styles.cardLabel}>Success card</Text>
          </SectionCard>
          <SectionCard style={styles.nestedCard} variant="info">
            <Text style={styles.cardLabel}>Info card</Text>
          </SectionCard>
        </View>
        <View style={styles.tokenRow}>
          <InfoPill label="Default" />
          <InfoPill label="Soft" tone="soft" />
          <InfoPill label="Warm" tone="warm" />
          <InfoPill label="Info" tone="info" />
          <InfoPill label="Low risk" tone="riskLow" />
          <InfoPill label="Medium risk" tone="riskMedium" />
          <InfoPill label="High risk" tone="riskHigh" />
          <InfoPill label="Danger" tone="danger" />
        </View>
        <View style={styles.tokenRow}>
          <OptionChip label="Profile" selected={selectedChip === 'profile'} onPress={() => setSelectedChip('profile')} />
          <OptionChip label="Scan" selected={selectedChip === 'scan'} onPress={() => setSelectedChip('scan')} />
          <OptionChip label="Disabled sample" selected={false} onPress={() => setSelectedChip('profile')} />
        </View>
        <InputField value={inputValue} placeholder="Type here" onChangeText={setInputValue} />
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Risk and chart tokens</Text>
        <View style={styles.gaugeRow}>
          <Gauge score={18} label="low" />
          <Gauge score={56} label="medium" />
          <Gauge score={82} label="high" />
        </View>
        <View style={styles.riskBarStack}>
          <RiskBar label="IBS" score={82} level="high" />
          <RiskBar label="Reflux" score={56} level="medium" />
          <RiskBar label="General" score={24} level="low" />
        </View>
      </SectionCard>

      <SectionCard>
        <Text style={styles.sectionTitle}>Pip registry</Text>
        <Text style={styles.sectionBody}>
          Screens must choose semantic Pip states. They should never require mascot filenames directly.
        </Text>
        <View style={styles.pipGrid}>
          {pipStates.map((state) => (
            <View key={state} style={styles.pipCell}>
              <View style={styles.pipAvatar}>
                <Pip state={state} size={72} accessibilityLabel={`Pip ${state}`} />
              </View>
              <Text style={styles.pipLabel}>{state}</Text>
            </View>
          ))}
        </View>
      </SectionCard>
    </AppScreen>
  );
}

function Swatch({
  label,
  value,
  textColor,
}: {
  label: string;
  value: string;
  textColor: string;
}) {
  return (
    <View style={[styles.swatch, { backgroundColor: value }]}>
      <Text style={[styles.swatchLabel, { color: textColor }]}>{label}</Text>
      <Text style={[styles.swatchValue, { color: textColor }]}>{value}</Text>
    </View>
  );
}

function TokenPill({ label }: { label: string }) {
  return (
    <View style={styles.tokenPill}>
      <Text style={styles.tokenPillLabel}>{label}</Text>
    </View>
  );
}

function ShadowSample({
  label,
  shadowStyle,
}: {
  label: string;
  shadowStyle: object;
}) {
  return (
    <View style={styles.shadowSampleWrap}>
      <View style={[styles.shadowSample, shadowStyle]} />
      <Text style={styles.shadowLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: tokens.color.text.primary,
    ...tokens.type.title.card,
  },
  // The hero surface demo: the one dark block a screen is allowed, with the
  // full on-hero text ramp so contrast rules stay visible in one place.
  heroCard: {
    ...components.card.hero,
    padding: tokens.space.lg,
    gap: tokens.space.sm,
    alignItems: 'flex-start',
  },
  heroEyebrow: {
    ...tokens.type.label.eyebrow,
    color: tokens.color.surface.hero.onHeroFaint,
  },
  heroTitle: {
    ...tokens.type.display.accent,
    color: tokens.color.surface.hero.onHero,
  },
  heroBody: {
    ...tokens.type.body.default,
    color: tokens.color.surface.hero.onHeroMuted,
  },
  heroMuted: {
    ...tokens.type.body.small,
    color: tokens.color.surface.hero.onHeroMuted,
  },
  heroFaint: {
    ...tokens.type.body.small,
    color: tokens.color.surface.hero.onHeroFaint,
  },
  heroRaisedChip: {
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surface.hero.raised,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.xs,
  },
  heroRaisedChipLabel: {
    ...tokens.type.label.chip,
    color: tokens.color.surface.hero.onHero,
  },
  sectionBody: {
    color: tokens.color.text.secondary,
    ...tokens.type.body.default,
  },
  swatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space.sm,
  },
  swatch: {
    width: '48%',
    minHeight: 86,
    borderRadius: tokens.radius.lg,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.md,
    justifyContent: 'space-between',
  },
  swatchLabel: {
    ...tokens.type.label.chip,
  },
  swatchValue: {
    ...tokens.type.body.small,
  },
  sampleText: {
    color: tokens.color.text.primary,
  },
  scaleLabel: {
    color: tokens.color.text.secondary,
    ...tokens.type.label.eyebrow,
  },
  tokenRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space.sm,
  },
  tokenPill: {
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.surface.card.warm,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
  },
  tokenPillLabel: {
    color: tokens.color.text.primary,
    ...tokens.type.label.chip,
  },
  shadowRow: {
    flexDirection: 'row',
    gap: tokens.space.md,
  },
  shadowSampleWrap: {
    alignItems: 'center',
    gap: tokens.space.sm,
  },
  // Borderless on purpose: shadows are the separation system now, so the
  // samples show the lift with nothing else helping.
  shadowSample: {
    width: 72,
    height: 72,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.surface.card.default,
  },
  shadowLabel: {
    color: tokens.color.text.secondary,
    ...tokens.type.body.small,
  },
  buttonStack: {
    gap: tokens.space.sm,
  },
  cardPreviewStack: {
    gap: tokens.space.sm,
  },
  nestedCard: {
    paddingVertical: tokens.space.md,
  },
  cardLabel: {
    color: tokens.color.text.primary,
    ...tokens.type.body.strong,
  },
  gaugeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: tokens.space.sm,
  },
  riskBarStack: {
    gap: tokens.space.md,
  },
  pipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space.md,
  },
  pipCell: {
    width: '30%',
    alignItems: 'center',
    gap: tokens.space.sm,
  },
  pipAvatar: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: tokens.color.surface.card.warm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipLabel: {
    color: tokens.color.text.secondary,
    textAlign: 'center',
    ...tokens.type.body.small,
  },
});

import { useDeferredValue, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { NavigationProp, useNavigation } from '@react-navigation/native';

import { InsightCard } from '../../components/cards/InsightCard';
import { AppScreen, AvatarButton, InfoPill, InputField, ScreenHeader, SectionCard } from '../../components/common/UI';
import { useInsightsData } from '../../features/insights/hooks';
import { trackEvent } from '../../services/analytics';
import { selectInsightBuckets, useAppStore } from '../../store/useAppStore';
import { palette, spacing, type } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

export function InsightsScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const fallbackProfile = useAppStore((state) => state.profile);
  const fallbackInsights = useAppStore((state) => state.insights);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const insightsQuery = useInsightsData(deferredSearch);
  const profile = insightsQuery.data?.profile ?? fallbackProfile;
  const insights = insightsQuery.data?.insights ?? fallbackInsights;
  const buckets = selectInsightBuckets(insights);

  useEffect(() => {
    trackEvent('insights_viewed');
  }, []);

  return (
    <AppScreen>
      <ScreenHeader
        eyebrow="Understanding layer"
        title="Insights"
        subtitle="Known conditions, likely trigger ingredients, and foods that are trending gentler for you."
        rightAccessory={<AvatarButton onPress={() => navigation.navigate('Settings')} />}
      />

      <SectionCard>
        <Text style={{ color: palette.text, fontFamily: type.body.bold, fontSize: 18 }}>Your conditions & sensitivities</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {profile?.knownConditions.length || profile?.knownIngredientSensitivities.length ? (
            [...(profile?.knownConditions ?? []), ...(profile?.knownIngredientSensitivities ?? [])].map((entry) => (
              <InfoPill key={entry} label={entry} tone="soft" />
            ))
          ) : (
            <Text style={{ color: palette.textMuted, fontFamily: type.body.regular, fontSize: 14 }}>
              Add more context over time from settings and confirmed meals.
            </Text>
          )}
        </View>
      </SectionCard>

      <SectionCard>
        <Text style={{ color: palette.text, fontFamily: type.body.bold, fontSize: 18 }}>Search ingredients</Text>
        <InputField value={search} placeholder="Search tomato, dairy, garlic…" onChangeText={setSearch} />
      </SectionCard>

      {insights.length === 0 ? (
        <SectionCard>
          <Text style={{ color: palette.text, fontFamily: type.body.bold, fontSize: 18 }}>Your insights will get sharper with each meal.</Text>
          <Text style={{ color: palette.textMuted, fontFamily: type.body.regular, fontSize: 14 }}>
            Once you confirm what you ate and how you felt, trigger and safe-food patterns will start appearing here.
          </Text>
        </SectionCard>
      ) : (
        <>
          <View style={{ gap: spacing.md }}>
            <Text style={{ color: palette.text, fontFamily: type.body.bold, fontSize: 18 }}>Possible triggers</Text>
            {buckets.triggers.map((insight) => (
              <Pressable
                key={insight.id}
                onPress={() => {
                  trackEvent('trigger_detail_viewed', { item_name: insight.ingredientName });
                  navigation.navigate('InsightDetail', { ingredientName: insight.ingredientName });
                }}
              >
                <InsightCard insight={insight} />
              </Pressable>
            ))}
          </View>

          <View style={{ gap: spacing.md }}>
            <Text style={{ color: palette.text, fontFamily: type.body.bold, fontSize: 18 }}>Safe foods</Text>
            {buckets.safeFoods.length ? (
              buckets.safeFoods.map((insight) => (
                <Pressable
                  key={insight.id}
                  onPress={() => {
                    trackEvent('safe_food_detail_viewed', { item_name: insight.ingredientName });
                    navigation.navigate('InsightDetail', { ingredientName: insight.ingredientName });
                  }}
                >
                  <InsightCard insight={insight} />
                </Pressable>
              ))
            ) : (
              <SectionCard>
                <Text style={{ color: palette.textMuted, fontFamily: type.body.regular, fontSize: 14 }}>
                  Safer-food signals show up as you confirm meals that felt good.
                </Text>
              </SectionCard>
            )}
          </View>
        </>
      )}
    </AppScreen>
  );
}

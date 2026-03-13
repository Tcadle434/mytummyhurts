import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { ActivityIndicator, Text } from 'react-native';

import { AppScreen, PrimaryButton, ScreenHeader, SectionCard } from '../../components/common/UI';
import { OnboardingStackParamList, RootStackParamList } from '../../navigation/types';
import { useAppStore } from '../../store/useAppStore';
import { palette, type } from '../../theme';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'FirstScanLanding'>;

export function FirstScanLandingScreen({ navigation }: Props) {
  const initialServerSyncNeeded = useAppStore((state) => state.initialServerSyncNeeded);
  const serverSyncInFlight = useAppStore((state) => state.serverSyncInFlight);
  const serverSyncError = useAppStore((state) => state.serverSyncError);
  const syncInitialAccountState = useAppStore((state) => state.syncInitialAccountState);

  useEffect(() => {
    if (!initialServerSyncNeeded) {
      return;
    }

    void syncInitialAccountState().catch(() => {
      // The error is already stored in Zustand for the screen to render.
    });
  }, [initialServerSyncNeeded, syncInitialAccountState]);

  return (
    <AppScreen>
      <ScreenHeader
        eyebrow="You're all set"
        title="Take a photo of a meal to get your first personalized risk score."
        subtitle="This first scan will seed your history and give the app something real to learn from."
      />

      <SectionCard>
        <Text style={{ color: palette.text, fontFamily: type.body.semibold, fontSize: 15 }}>
          Scan first. The rest of the app will wake up from there.
        </Text>
        {serverSyncInFlight ? <ActivityIndicator color={palette.primary} /> : null}
        {serverSyncError ? (
          <Text style={{ color: palette.high, fontFamily: type.body.regular, fontSize: 14 }}>
            {serverSyncError}
          </Text>
        ) : null}
      </SectionCard>

      <PrimaryButton
        label={serverSyncInFlight ? 'Finishing setup…' : 'Open camera'}
        disabled={serverSyncInFlight}
        onPress={() =>
          navigation.getParent<import('@react-navigation/native').NavigationProp<RootStackParamList>>()?.navigate(
            'ScanCapture',
            {
              sourceType: 'camera',
              fromOnboarding: true,
            },
          )
        }
      />
    </AppScreen>
  );
}

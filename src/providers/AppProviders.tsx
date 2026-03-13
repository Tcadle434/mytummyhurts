import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { QueryClientProvider } from '@tanstack/react-query';
import { SuperwallProvider } from 'expo-superwall';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { RuntimeServices, SuperwallBillingBridge, SuperwallIdentityBridge } from '../components/system/RuntimeServices';
import { env, isSuperwallConfigured } from '../config/env';
import { queryClient } from '../services/query/client';
import { palette } from '../theme';

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    InstrumentSerif_400Regular,
  });

  if (!fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.background,
        }}
      >
        <ActivityIndicator color={palette.primary} size="large" />
        <StatusBar style="dark" />
      </View>
    );
  }

  const content = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <RuntimeServices>{children}</RuntimeServices>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );

  if (!isSuperwallConfigured) {
    return content;
  }

  return (
    <SuperwallProvider
      apiKeys={{ ios: env.superwallApiKey }}
      options={{
        shouldObservePurchases: true,
      }}
      onConfigurationError={(error) => {
        console.warn('[superwall] configuration error', error);
      }}
    >
      <SuperwallIdentityBridge />
      <SuperwallBillingBridge />
      {content}
    </SuperwallProvider>
  );
}

import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  AppScreen,
  PrimaryButton,
  ScreenHeader,
  SectionCard,
  SecondaryButton,
} from '../../components/common/UI';
import { trackEvent } from '../../services/analytics';
import { palette, radii, spacing, type } from '../../theme';
import { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ScanCapture'>;

export function ScanCaptureScreen({ navigation, route }: Props) {
  const sourceType = route.params?.sourceType ?? 'camera';
  const manualMode = route.params?.manualMode ?? false;
  const fromOnboarding = route.params?.fromOnboarding ?? false;
  const [permission, requestPermission] = useCameraPermissions();
  const [autoOpened, setAutoOpened] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  useEffect(() => {
    if ((sourceType === 'upload' || sourceType === 'manual_upload') && !autoOpened) {
      setAutoOpened(true);
      void openLibrary();
    }
  }, [autoOpened, sourceType]);

  async function openLibrary() {
    trackEvent('photo_uploaded', { source_type: sourceType });
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) {
      return;
    }

    navigation.replace('ScanAnalyzing', {
      payload: {
        sourceType,
        imageUri: result.assets[0].uri,
      },
      manualMode,
      fromOnboarding,
    });
  }

  async function capturePhoto() {
    const picture = await cameraRef.current?.takePictureAsync({ quality: 0.8 });
    if (!picture?.uri) {
      return;
    }

    trackEvent('scan_capture_completed', { source_type: sourceType });
    navigation.replace('ScanAnalyzing', {
      payload: {
        sourceType,
        imageUri: picture.uri,
      },
      manualMode,
      fromOnboarding,
    });
  }

  return (
    <AppScreen scroll={false} contentContainerStyle={{ flex: 1 }}>
      <ScreenHeader
        eyebrow="Camera"
        title={manualMode ? 'Add a meal photo' : 'Scan your meal'}
        subtitle={manualMode ? 'Capture or upload a meal you already had.' : 'Take a clear photo of the meal in front of you.'}
      />

      {permission?.granted ? (
        <View style={styles.cameraWrap}>
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
          <View style={styles.cameraOverlay}>
            <Text style={styles.overlayLabel}>Center the meal and keep the full plate visible.</Text>
          </View>
        </View>
      ) : (
        <SectionCard style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={styles.permissionTitle}>Camera access helps the app feel instant.</Text>
          <Text style={styles.permissionBody}>
            You can still upload a photo if you are on a simulator or do not want camera access yet.
          </Text>
          <PrimaryButton label="Allow camera" onPress={() => requestPermission()} />
        </SectionCard>
      )}

      <View style={styles.actions}>
        <SecondaryButton label="Upload photo" onPress={openLibrary} />
        {permission?.granted ? <PrimaryButton label="Take photo" onPress={capturePhoto} /> : null}
        <SecondaryButton
          label="Use demo scan"
          onPress={() =>
            navigation.replace('ScanAnalyzing', {
              payload: { sourceType, imageUri: undefined },
              manualMode,
              fromOnboarding,
            })
          }
        />
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  cameraWrap: {
    flex: 1,
    minHeight: 360,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: '#223128',
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: 'rgba(16,24,20,0.45)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
  },
  overlayLabel: {
    color: palette.white,
    fontFamily: type.body.medium,
    fontSize: 13,
  },
  actions: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  permissionTitle: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 18,
  },
  permissionBody: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 14,
    lineHeight: 21,
  },
});

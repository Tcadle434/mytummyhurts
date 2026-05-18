import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppScreen, PrimaryButton, ScreenHeader, SectionCard, SecondaryButton } from '../../components/common/UI';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { components, palette, radii, shadows, spacing, tokens, type } from '../../theme';
import { createScanRequestId } from '../../utils/id';

type Props = NativeStackScreenProps<RootStackParamList, 'ScanCapture'>;

export function ScanCaptureScreen({ navigation, route }: Props) {
  const sourceType = route.params?.sourceType ?? 'camera';
  const manualMode = route.params?.manualMode ?? false;
  const scanCategory = route.params?.scanCategory;
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
        requestId: createScanRequestId(),
        sourceType,
        imageUri: result.assets[0].uri,
        scanCategory,
      },
      manualMode,
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
        requestId: createScanRequestId(),
        sourceType,
        imageUri: picture.uri,
        scanCategory,
      },
      manualMode,
    });
  }

  return (
    <AppScreen scroll={false} contentContainerStyle={styles.content}>
      <ScreenHeader
        title={manualMode ? 'Add your meal' : 'Scan your meal'}
        subtitle={manualMode ? 'Take a photo, upload one, or describe what you ate.' : 'Clear photo = better insights'}
        rightAccessory={
          <Pressable
            onPress={() =>
              Alert.alert(
                'Better scans',
                'Include the full plate, keep the image sharp, and make sure sauces or sides are visible.',
              )
            }
            style={({ pressed }) => [styles.helpButton, pressed && { opacity: 0.75 }]}
          >
            <Ionicons name="help-circle-outline" size={24} color={palette.text} />
          </Pressable>
        }
      />

      {permission?.granted ? (
        <View style={styles.cameraCard}>
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
          <View style={styles.cameraScrim} />

          <View style={styles.previewBadgeLeft}>
            <Ionicons name="flash-outline" size={20} color={palette.white} />
          </View>

          <View style={styles.previewControls}>
            <View style={styles.previewControl}>
              <Ionicons name="flash-outline" size={22} color={palette.white} />
            </View>

            <Pressable onPress={() => void capturePhoto()} style={({ pressed }) => [styles.shutterOuter, pressed && { transform: [{ scale: 0.96 }] }]}>
              <View style={styles.shutterInner}>
                <Text style={styles.shutterZoom}>1x</Text>
              </View>
            </Pressable>

            <View style={styles.previewControl}>
              <Ionicons name="scan-outline" size={20} color={palette.white} />
            </View>
          </View>
        </View>
      ) : (
        <SectionCard style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>Camera access keeps scanning instant.</Text>
          <Text style={styles.permissionBody}>You can still upload a photo or describe the meal if you do not want camera access yet.</Text>
          <PrimaryButton label="Allow camera" onPress={() => requestPermission()} />
        </SectionCard>
      )}

      <View style={styles.actionGrid}>
        <ActionTile icon="camera-outline" label="Take photo" onPress={() => void capturePhoto()} disabled={!permission?.granted} tone="green" />
        <ActionTile icon="arrow-up-outline" label="Upload" onPress={openLibrary} tone="coral" />
        <ActionTile
          icon="create-outline"
          label="Describe meal"
          onPress={() => navigation.replace('ManualMeal', {})}
          tone="amber"
        />
      </View>

      {!permission?.granted ? (
        <SecondaryButton
          label="Use demo scan"
          onPress={() => navigation.replace('ScanAnalyzing', { payload: { requestId: createScanRequestId(), sourceType, imageUri: undefined, scanCategory }, manualMode })}
        />
      ) : null}
    </AppScreen>
  );
}

function ActionTile({
  icon,
  label,
  onPress,
  disabled,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone: 'green' | 'coral' | 'amber';
}) {
  const iconColor = tone === 'green' ? palette.primary : tone === 'coral' ? palette.peachStrong : palette.medium;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.tile, (pressed || disabled) && { opacity: pressed ? 0.82 : 0.46 }]}
    >
      <Ionicons name={icon} size={30} color={iconColor} />
      <Text style={styles.tileLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: spacing.lg,
    justifyContent: 'flex-start',
  },
  helpButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.color.surface.frosted,
    borderWidth: 1,
    borderColor: tokens.color.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraCard: {
    flex: 1,
    minHeight: 470,
    borderRadius: 34,
    overflow: 'hidden',
    backgroundColor: tokens.color.text.primary,
    position: 'relative',
    ...shadows.lift,
  },
  cameraScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  previewBadgeLeft: {
    position: 'absolute',
    left: spacing.md,
    top: spacing.md,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(14, 18, 16, 0.48)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewControls: {
    position: 'absolute',
    bottom: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewControl: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(14, 18, 16, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(27, 28, 30, 0.28)',
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(36, 37, 39, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterZoom: {
    color: palette.white,
    fontFamily: type.body.semibold,
    fontSize: 22,
    letterSpacing: -0.5,
  },
  permissionCard: {
    flex: 1,
    justifyContent: 'center',
  },
  permissionTitle: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 24,
    letterSpacing: -0.5,
  },
  permissionBody: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  actionGrid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  tile: {
    flex: 1,
    minHeight: 118,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: components.card.default.borderColor,
    backgroundColor: components.card.default.backgroundColor,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    ...shadows.card,
  },
  tileLabel: {
    color: palette.text,
    fontFamily: type.body.semibold,
    fontSize: 16,
  },
});

import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppScreen, PrimaryButton, ScreenHeader, SectionCard, SecondaryButton } from '../../components/common/UI';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { prepareScanImageAsset, scanImageDataUrl } from '../../services/images/scanImage';
import { components, palette, radii, shadows, spacing, tokens, type } from '../../theme';
import { createScanRequestId } from '../../utils/id';
import { buildBarcodeScanPayload, buildImageScanPayload } from './scanPayload';

type Props = NativeStackScreenProps<RootStackParamList, 'ScanCapture'>;
type ImageCaptureMode = 'food' | 'menu';
type CaptureMode = ImageCaptureMode | 'barcode';
type SelectedImage = {
  uri: string;
  dataUrl?: string;
};

const SCAN_IMAGE_QUALITY = 0.68;
const BARCODE_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;
const SUPPORTED_BARCODE_TYPES = new Set<string>(BARCODE_TYPES);
const MODE_COPY: Record<CaptureMode, {
  title: string;
  subtitle: string;
  pillLabel: string;
  pillIcon: keyof typeof Ionicons.glyphMap;
}> = {
  food: {
    title: 'Scan food',
    subtitle: 'Take a photo or upload meal images for analysis.',
    pillLabel: 'Food scan',
    pillIcon: 'restaurant-outline',
  },
  menu: {
    title: 'Scan menu',
    subtitle: 'Take or upload menu photos to rank the best options.',
    pillLabel: 'Menu scan',
    pillIcon: 'reader-outline',
  },
  barcode: {
    title: 'Scan barcode',
    subtitle: 'Point the camera at a UPC or EAN barcode.',
    pillLabel: 'Barcode scan',
    pillIcon: 'barcode-outline',
  },
};

function initialCaptureMode(routeParams: Props['route']['params']): CaptureMode {
  if (routeParams?.initialMode) {
    return routeParams.initialMode;
  }
  if (routeParams?.scanCategory === 'menu') {
    return 'menu';
  }
  if (routeParams?.scanCategory === 'grocery' || routeParams?.sourceType === 'barcode') {
    return 'barcode';
  }
  return 'food';
}

export function ScanCaptureScreen({ navigation, route }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<CaptureMode>(initialCaptureMode(route.params));
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [barcodeBusy, setBarcodeBusy] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);
  const modeCopy = MODE_COPY[mode];
  const imageScanCategory: ImageCaptureMode = mode === 'menu' ? 'menu' : 'food';
  const barcodeDisabled = Boolean(!permission?.granted && permission?.canAskAgain === false);

  const openLibrary = useCallback(async () => {
    const scanCategory = mode === 'menu' ? 'menu' : 'food';
    trackEvent('photo_uploaded', { source_type: 'upload', scan_category: scanCategory });
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        allowsMultipleSelection: true,
        base64: true,
        mediaTypes: ['images'],
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: SCAN_IMAGE_QUALITY,
      });

      if (result.canceled || !result.assets.length) {
        return;
      }

      const images = await Promise.all(
        result.assets.map((asset) => prepareScanImageAsset(asset, SCAN_IMAGE_QUALITY)),
      );
      setSelectedImages((current) => [
        ...current,
        ...images.map((image) => ({
          uri: image.uri,
          dataUrl: image.dataUrl,
        })),
      ]);
    } catch (error) {
      console.warn('[scan] image preparation failed', error);
      Alert.alert('Image could not be prepared', 'Try choosing the photo again, or take a new picture.');
    }
  }, [mode]);

  function analyzeUploadedImages() {
    if (!selectedImages.length) {
      return;
    }

    navigation.replace('ScanAnalyzing', {
      payload: buildImageScanPayload({
        requestId: createScanRequestId(),
        sourceType: 'upload',
        scanCategory: imageScanCategory,
        images: selectedImages,
      }),
      manualMode: false,
    });
  }

  async function capturePhoto() {
    if (mode === 'barcode' || !cameraReady || capturing) {
      return;
    }

    setCapturing(true);
    try {
      const picture = await cameraRef.current?.takePictureAsync({ quality: SCAN_IMAGE_QUALITY, base64: true });
      if (!picture?.uri) {
        return;
      }

      const dataUrl = scanImageDataUrl(picture.base64, picture.format === 'png' ? 'image/png' : 'image/jpeg');
      trackEvent('scan_capture_completed', { source_type: 'camera', scan_category: mode });
      navigation.replace('ScanAnalyzing', {
        payload: buildImageScanPayload({
          requestId: createScanRequestId(),
          sourceType: 'camera',
          scanCategory: mode,
          images: [{ uri: picture.uri, dataUrl }],
        }),
        manualMode: false,
      });
    } catch (error) {
      console.warn('[scan] camera capture failed', error);
      Alert.alert('Camera is still warming up', 'Give the camera a second, then try again.');
    } finally {
      setCapturing(false);
    }
  }

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (mode !== 'barcode' || barcodeBusy || !result.data || !SUPPORTED_BARCODE_TYPES.has(result.type)) {
      return;
    }

    const barcode = result.data.trim();
    if (!barcode) {
      return;
    }

    setBarcodeBusy(true);
    trackEvent('barcode_scan_completed', { barcode_type: result.type });
    navigation.replace('ScanAnalyzing', {
      payload: buildBarcodeScanPayload({
        requestId: createScanRequestId(),
        barcode,
      }),
      manualMode: false,
    });
  }

  function removeSelectedImage(uri: string) {
    setSelectedImages((current) => current.filter((image) => image.uri !== uri));
  }

  async function selectScanMode(nextMode: CaptureMode) {
    if (nextMode === mode) {
      return;
    }

    if (nextMode !== 'barcode') {
      setBarcodeBusy(false);
      setMode(nextMode);
      trackEvent('scan_mode_selected', { entry_point: 'scan_capture', scan_category: nextMode });
      return;
    }

    if (!permission?.granted) {
      const nextPermission = await requestPermission();
      if (!nextPermission.granted) {
        return;
      }
    }
    setSelectedImages([]);
    setBarcodeBusy(false);
    setMode('barcode');
    trackEvent('barcode_scanner_opened', { entry_point: 'scan_capture' });
  }

  const subActions = [
    {
      key: 'food',
      icon: 'restaurant-outline',
      label: 'Food scan',
      disabled: false,
      onPress: () => void selectScanMode('food'),
    },
    {
      key: 'menu',
      icon: 'reader-outline',
      label: 'Menu scan',
      disabled: false,
      onPress: () => void selectScanMode('menu'),
    },
    {
      key: 'barcode',
      icon: 'barcode-outline',
      label: 'Barcode scan',
      disabled: barcodeDisabled,
      onPress: () => void selectScanMode('barcode'),
    },
    {
      key: 'describe',
      icon: 'create-outline',
      label: 'Describe meal',
      disabled: false,
      onPress: () => navigation.replace('ManualMeal', {}),
    },
  ] as const;
  const visibleSubActions = subActions.filter((action) => action.key !== mode);

  return (
    <AppScreen scroll={false} contentContainerStyle={styles.content}>
      <ScreenHeader
        title={modeCopy.title}
        subtitle={modeCopy.subtitle}
      />

      {permission?.granted ? (
        <View style={styles.cameraCard}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={mode === 'barcode' ? { barcodeTypes: [...BARCODE_TYPES] } : undefined}
            onBarcodeScanned={mode === 'barcode' ? handleBarcodeScanned : undefined}
            onCameraReady={() => setCameraReady(true)}
            onMountError={() => setCameraReady(false)}
          />
          <View style={styles.cameraScrim} />

          <View style={styles.cameraTopBar}>
            <View style={styles.modePill}>
              <Ionicons name={modeCopy.pillIcon} size={16} color={palette.white} />
              <Text style={styles.modePillLabel}>{modeCopy.pillLabel}</Text>
            </View>
          </View>

          {mode === 'barcode' ? (
            <View style={styles.barcodeFrameWrap}>
              <View style={styles.barcodeFrame}>
                <View style={[styles.corner, styles.cornerTopLeft]} />
                <View style={[styles.corner, styles.cornerTopRight]} />
                <View style={[styles.corner, styles.cornerBottomLeft]} />
                <View style={[styles.corner, styles.cornerBottomRight]} />
              </View>
              <Text style={styles.barcodeHint}>{barcodeBusy ? 'Opening product analysis...' : 'Center the barcode in the frame'}</Text>
            </View>
          ) : (
            <View style={styles.previewControls}>
              <View style={styles.previewControl}>
                <Ionicons name="flash-outline" size={22} color={palette.white} />
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={mode === 'menu' ? 'Take menu photo' : 'Take food photo'}
                onPress={() => void capturePhoto()}
                disabled={!cameraReady || capturing}
                style={({ pressed }) => [
                  styles.shutterOuter,
                  pressed && { transform: [{ scale: 0.96 }] },
                  (!cameraReady || capturing) && { opacity: 0.58 },
                ]}
              >
                <View style={styles.shutterInner} />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={mode === 'menu' ? 'Upload menu images' : 'Upload food images'}
                onPress={() => void openLibrary()}
                style={({ pressed }) => [styles.uploadOverlayButton, pressed && { opacity: 0.82 }]}
              >
                <Ionicons name="images-outline" size={24} color={palette.white} />
                {selectedImages.length ? (
                  <View style={styles.uploadCount}>
                    <Text style={styles.uploadCountLabel}>{selectedImages.length}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          )}
        </View>
      ) : (
        <SectionCard style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>Camera access keeps scanning instant.</Text>
          <Text style={styles.permissionBody}>
            You can still upload photos or describe a meal without camera access.
          </Text>
          <PrimaryButton label="Allow camera" onPress={() => requestPermission()} />
          <SecondaryButton label={imageScanCategory === 'menu' ? 'Upload menu photos' : 'Upload food photos'} onPress={() => void openLibrary()} />
        </SectionCard>
      )}

      {selectedImages.length ? (
        <SectionCard style={styles.uploadTrayCard}>
          <View style={styles.uploadTrayHeader}>
            <View>
              <Text style={styles.uploadTrayTitle}>Uploaded images</Text>
              <Text style={styles.uploadTraySubtitle}>
                {selectedImages.length} image{selectedImages.length === 1 ? '' : 's'} ready
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add more images"
              onPress={() => void openLibrary()}
              style={({ pressed }) => [styles.addMoreButton, pressed && { opacity: 0.82 }]}
            >
              <Ionicons name="add" size={16} color={palette.primary} />
              <Text style={styles.addMoreLabel}>Add</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRail}>
            {selectedImages.map((image, index) => (
              <View key={`${image.uri}-${index}`} style={styles.thumbWrap}>
                <Image source={{ uri: image.uri }} style={styles.thumb} resizeMode="cover" />
                <Text style={styles.thumbLabel}>Image {index + 1}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove image ${index + 1}`}
                  onPress={() => removeSelectedImage(image.uri)}
                  style={styles.removeImageButton}
                >
                  <Ionicons name="close" size={14} color={palette.white} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
          <PrimaryButton label={imageScanCategory === 'menu' ? 'Analyze menu' : 'Analyze food'} onPress={analyzeUploadedImages} />
        </SectionCard>
      ) : null}

      <View style={styles.subActionRow}>
        {visibleSubActions.map((action) => (
          <SubAction
            key={action.key}
            icon={action.icon}
            label={action.label}
            disabled={action.disabled}
            onPress={action.onPress}
          />
        ))}
      </View>
    </AppScreen>
  );
}

function SubAction({
  icon,
  label,
  selected,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.subAction,
        selected && styles.subActionSelected,
        disabled && { opacity: 0.45 },
        pressed && !disabled && { opacity: 0.84 },
      ]}
    >
      <View style={[styles.subActionIcon, selected && styles.subActionIconSelected]}>
        <Ionicons name={icon} size={19} color={selected ? palette.white : palette.primary} />
      </View>
      <Text style={[styles.subActionLabel, selected && styles.subActionLabelSelected]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: spacing.md,
    justifyContent: 'flex-start',
  },
  cameraCard: {
    flex: 1,
    minHeight: 460,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: tokens.color.text.primary,
    position: 'relative',
    ...shadows.lift,
  },
  cameraScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  cameraTopBar: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modePill: {
    minHeight: 34,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(14, 18, 16, 0.56)',
    paddingHorizontal: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modePillLabel: {
    color: palette.white,
    fontFamily: type.body.bold,
    fontSize: 13,
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
    backgroundColor: 'rgba(14, 18, 16, 0.58)',
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
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  uploadOverlayButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(14, 18, 16, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  uploadCount: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: palette.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: palette.white,
  },
  uploadCountLabel: {
    color: palette.white,
    fontFamily: type.body.bold,
    fontSize: 11,
  },
  barcodeFrameWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  barcodeFrame: {
    width: '74%',
    height: 170,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderColor: palette.white,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  barcodeHint: {
    color: palette.white,
    fontFamily: type.body.bold,
    fontSize: 15,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.32)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  permissionCard: {
    flex: 1,
    justifyContent: 'center',
  },
  permissionTitle: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 24,
    lineHeight: 30,
  },
  permissionBody: {
    color: palette.textMuted,
    fontFamily: type.body.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  uploadTrayCard: {
    gap: spacing.md,
  },
  uploadTrayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  uploadTrayTitle: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 18,
  },
  uploadTraySubtitle: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 13,
  },
  addMoreButton: {
    minHeight: 36,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.pillGreenBorder,
    backgroundColor: palette.pillGreen,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  addMoreLabel: {
    color: palette.primary,
    fontFamily: type.body.bold,
    fontSize: 13,
  },
  thumbRail: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  thumbWrap: {
    width: 82,
    gap: 5,
    position: 'relative',
  },
  thumb: {
    width: 82,
    height: 92,
    borderRadius: radii.md,
    backgroundColor: tokens.color.surface.card.warm,
  },
  thumbLabel: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 11,
    textAlign: 'center',
  },
  removeImageButton: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(14,18,16,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subActionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  subAction: {
    flex: 1,
    minHeight: 78,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: components.card.default.borderColor,
    backgroundColor: components.card.default.backgroundColor,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    ...shadows.card,
  },
  subActionSelected: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  subActionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: tokens.color.status.success.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subActionIconSelected: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  subActionLabel: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 14,
    lineHeight: 18,
    textAlign: 'center',
  },
  subActionLabelSelected: {
    color: palette.white,
  },
});

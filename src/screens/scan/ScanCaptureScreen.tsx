import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppScreen, PrimaryButton, SectionCard, SecondaryButton } from '../../components/common/UI';
import { Pip } from '../../components/common/Pip';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { prepareCameraScanImage, prepareScanImageAsset } from '../../services/images/scanImage';
import { palette, radii, shadows, spacing, tokens, type } from '../../theme';
import { withAlpha } from '../../theme/helpers';
import { createScanRequestId } from '../../utils/id';
import { buildBarcodeScanPayload, buildImageScanPayload } from './scanPayload';
import { ScanModeTabs, type ScanModeTab } from './ScanModeTabs';

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
// Mode copy lives in-frame, under the mode tabs, so the viewfinder keeps the
// height a screen header used to spend restating the tab labels. Barcode mode
// carries its own hint inside the scanning frame.
const MODE_HINTS: Record<ImageCaptureMode, string> = {
  food: "Snap your plate — we'll read the ingredients.",
  menu: "Snap each menu page — we'll find your safest picks.",
};

const MODE_TABS: ScanModeTab<CaptureMode>[] = [
  { key: 'food', label: 'Food', icon: 'restaurant-outline' },
  { key: 'menu', label: 'Menu', icon: 'reader-outline' },
  { key: 'barcode', label: 'Barcode', icon: 'barcode-outline' },
];

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
  const [torchOn, setTorchOn] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);
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
      const picture = await cameraRef.current?.takePictureAsync({ quality: SCAN_IMAGE_QUALITY });
      if (!picture?.uri) {
        return;
      }

      const image = await prepareCameraScanImage({
        uri: picture.uri,
        quality: SCAN_IMAGE_QUALITY,
      });
      trackEvent('scan_capture_completed', { source_type: 'camera', scan_category: mode });
      navigation.replace('ScanAnalyzing', {
        payload: buildImageScanPayload({
          requestId: createScanRequestId(),
          sourceType: 'camera',
          scanCategory: mode,
          images: [image],
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

  const modeTabs: ScanModeTab<CaptureMode>[] = MODE_TABS.map((tab) =>
    tab.key === 'barcode' ? { ...tab, disabled: barcodeDisabled } : tab,
  );

  return (
    <AppScreen scroll={false} contentContainerStyle={styles.content}>
      {navigation.canGoBack() ? (
        <View style={styles.chromeRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.72 }]}
          >
            <Ionicons name="chevron-back" size={22} color={tokens.color.icon.primary} />
          </Pressable>
        </View>
      ) : null}

      {permission?.granted ? (
        <View style={styles.cameraCard}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torchOn}
            barcodeScannerSettings={mode === 'barcode' ? { barcodeTypes: [...BARCODE_TYPES] } : undefined}
            onBarcodeScanned={mode === 'barcode' ? handleBarcodeScanned : undefined}
            onCameraReady={() => setCameraReady(true)}
            onMountError={() => setCameraReady(false)}
          />
          <View style={styles.cameraScrim} />

          <View style={styles.cameraTopBar}>
            <ScanModeTabs tabs={modeTabs} value={mode} onChange={(next) => void selectScanMode(next)} />
            {mode !== 'barcode' ? (
              <Text style={styles.modeHint}>{MODE_HINTS[imageScanCategory]}</Text>
            ) : null}
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
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={torchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
                accessibilityState={{ selected: torchOn }}
                onPress={() => setTorchOn((current) => !current)}
                style={({ pressed }) => [
                  styles.previewControl,
                  torchOn && styles.previewControlActive,
                  pressed && { opacity: 0.82 },
                ]}
              >
                <Ionicons
                  name={torchOn ? 'flash' : 'flash-off-outline'}
                  size={22}
                  color={torchOn ? palette.text : palette.white}
                />
              </Pressable>

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
          <View style={styles.permissionPip}>
            <Pip state="waving" size={96} />
          </View>
          <Text style={styles.permissionTitle}>Camera access keeps scanning instant.</Text>
          <Text style={styles.permissionBody}>
            {mode === 'barcode'
              ? 'Barcode scans need camera access.'
              : 'You can still upload food or menu photos without camera access.'}
          </Text>
          {selectedImages.length ? (
            // With images queued, "Analyze" in the tray below is the screen's
            // one saturated action; the camera ask steps back to secondary.
            <SecondaryButton label="Allow camera" onPress={() => requestPermission()} />
          ) : (
            <PrimaryButton label="Allow camera" onPress={() => requestPermission()} />
          )}
          {mode !== 'barcode' ? (
            <SecondaryButton label={imageScanCategory === 'menu' ? 'Upload menu photos' : 'Upload food photos'} onPress={() => void openLibrary()} />
          ) : null}
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
              <Ionicons name="add" size={16} color={tokens.color.action.quiet.foreground} />
              <Text style={styles.addMoreLabel}>Add</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRail}>
            {selectedImages.map((image, index) => (
              <View key={`${image.uri}-${index}`} style={styles.thumbWrap}>
                <Image source={{ uri: image.uri }} style={styles.thumb} resizeMode="cover" />
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
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: spacing.md,
    justifyContent: 'flex-start',
  },
  chromeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Borderless white disc on porcelain — separation comes from the shadow.
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: tokens.color.surface.card.default,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  modeHint: {
    ...tokens.type.body.small,
    marginTop: spacing.sm,
    color: tokens.color.surface.viewfinder.onGlass,
    fontFamily: type.body.medium,
    textAlign: 'center',
    textShadowColor: tokens.color.overlay.scrim,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  // The viewfinder is the app's one dark block: ink behind the feed with
  // the original dark camera glass for overlays.
  cameraCard: {
    flex: 1,
    minHeight: 460,
    borderRadius: radii.xxl,
    overflow: 'hidden',
    backgroundColor: tokens.color.text.primary,
    position: 'relative',
    ...shadows.lift,
  },
  cameraScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: withAlpha(tokens.color.utility.shadow, 0.12),
  },
  cameraTopBar: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
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
  // Camera-overlay glass: evergreen-deep instead of neutral black smoke.
  previewControl: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: withAlpha(tokens.color.surface.viewfinder.glass, 0.58),
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewControlActive: {
    backgroundColor: withAlpha(tokens.color.utility.white, 0.92),
  },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: withAlpha(tokens.color.utility.white, 0.92),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(tokens.color.surface.viewfinder.glass, 0.28),
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: withAlpha(tokens.color.utility.white, 0.92),
  },
  uploadOverlayButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: withAlpha(tokens.color.surface.viewfinder.glass, 0.72),
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
    textShadowColor: tokens.color.overlay.scrim,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 5,
  },
  permissionCard: {
    flex: 1,
    justifyContent: 'center',
  },
  permissionPip: {
    alignItems: 'center',
  },
  permissionTitle: {
    ...tokens.type.title.card,
    color: palette.text,
    textAlign: 'center',
  },
  permissionBody: {
    ...tokens.type.body.default,
    color: palette.textMuted,
    textAlign: 'center',
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
  // Card titles speak in Bricolage via the title tokens.
  uploadTrayTitle: {
    ...tokens.type.title.block,
    color: palette.text,
  },
  uploadTraySubtitle: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 13,
  },
  // Quiet action pill: mint wash, no hairline — borderless is the system.
  addMoreButton: {
    minHeight: 36,
    borderRadius: radii.pill,
    backgroundColor: tokens.color.action.quiet.background,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  addMoreLabel: {
    color: tokens.color.action.quiet.foreground,
    fontFamily: type.body.bold,
    fontSize: 13,
  },
  thumbRail: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  thumbWrap: {
    width: 72,
    position: 'relative',
  },
  thumb: {
    width: 72,
    height: 80,
    borderRadius: radii.md,
    backgroundColor: tokens.color.surface.card.warm,
  },
  removeImageButton: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: withAlpha(tokens.color.surface.viewfinder.glass, 0.72),
    alignItems: 'center',
    justifyContent: 'center',
  },
});

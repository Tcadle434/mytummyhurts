import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppScreen, PrimaryButton, ScreenHeader, SectionCard, SecondaryButton } from '../../components/common/UI';
import { RootStackParamList } from '../../navigation/types';
import { trackEvent } from '../../services/analytics';
import { prepareScanImageAsset, scanImageDataUrl } from '../../services/images/scanImage';
import { components, palette, radii, shadows, spacing, tokens, type } from '../../theme';
import { createScanRequestId } from '../../utils/id';

type Props = NativeStackScreenProps<RootStackParamList, 'ScanCapture'>;
type MenuPage = {
  uri: string;
  dataUrl?: string;
};

const SCAN_IMAGE_QUALITY = 0.68;

export function ScanCaptureScreen({ navigation, route }: Props) {
  const sourceType = route.params?.sourceType ?? 'camera';
  const manualMode = route.params?.manualMode ?? false;
  const scanCategory = route.params?.scanCategory;
  const isMenuScan = scanCategory === 'menu';
  const [permission, requestPermission] = useCameraPermissions();
  const [autoOpened, setAutoOpened] = useState(false);
  const [menuPages, setMenuPages] = useState<MenuPage[]>([]);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView | null>(null);

  const openLibrary = useCallback(async () => {
    trackEvent('photo_uploaded', { source_type: sourceType });
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        allowsMultipleSelection: isMenuScan,
        base64: true,
        mediaTypes: ['images'],
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
        quality: SCAN_IMAGE_QUALITY,
      });

      if (result.canceled || !result.assets[0]) {
        return;
      }

      if (isMenuScan) {
        const pages = await Promise.all(
          result.assets.map((asset) => prepareScanImageAsset(asset, SCAN_IMAGE_QUALITY)),
        );
        setMenuPages((current) => [
          ...current,
          ...pages.map((page) => ({
            uri: page.uri,
            dataUrl: page.dataUrl,
          })),
        ]);
        return;
      }

      const image = await prepareScanImageAsset(result.assets[0], SCAN_IMAGE_QUALITY);
      navigation.replace('ScanAnalyzing', {
        payload: {
          requestId: createScanRequestId(),
          sourceType,
          imageUri: image.uri,
          imageDataUrl: image.dataUrl,
          scanCategory,
        },
        manualMode,
      });
    } catch (error) {
      console.warn('[scan] image preparation failed', error);
      Alert.alert('Image could not be prepared', 'Try choosing the photo again, or take a new picture.');
    }
  }, [isMenuScan, manualMode, navigation, scanCategory, sourceType]);

  useEffect(() => {
    if (!isMenuScan && (sourceType === 'upload' || sourceType === 'manual_upload') && !autoOpened) {
      setAutoOpened(true);
      void openLibrary();
    }
  }, [autoOpened, isMenuScan, openLibrary, sourceType]);

  async function capturePhoto() {
    if (!cameraReady || capturing) {
      return;
    }

    setCapturing(true);
    try {
      const picture = await cameraRef.current?.takePictureAsync({ quality: SCAN_IMAGE_QUALITY, base64: true });
      if (!picture?.uri) {
        return;
      }

      const dataUrl = scanImageDataUrl(picture.base64, picture.format === 'png' ? 'image/png' : 'image/jpeg');
      trackEvent('scan_capture_completed', { source_type: sourceType });
      if (isMenuScan) {
        setMenuPages((current) => [...current, { uri: picture.uri, dataUrl }]);
        return;
      }

      navigation.replace('ScanAnalyzing', {
        payload: {
          requestId: createScanRequestId(),
          sourceType,
          imageUri: picture.uri,
          imageDataUrl: dataUrl,
          scanCategory,
        },
        manualMode,
      });
    } catch (error) {
      console.warn('[scan] camera capture failed', error);
      Alert.alert('Camera is still warming up', 'Give the camera a second, then try again.');
    } finally {
      setCapturing(false);
    }
  }

  function removeMenuPage(uri: string) {
    setMenuPages((current) => current.filter((page) => page.uri !== uri));
  }

  function analyzeMenu() {
    if (!menuPages.length) {
      return;
    }

    navigation.replace('ScanAnalyzing', {
      payload: {
        requestId: createScanRequestId(),
        sourceType,
        imageUri: menuPages[0]?.uri,
        imageUris: menuPages.map((page) => page.uri),
        imageDataUrl: menuPages[0]?.dataUrl,
        imageDataUrls: menuPages.map((page) => page.dataUrl).filter((dataUrl): dataUrl is string => Boolean(dataUrl)),
        scanCategory: 'menu',
      },
      manualMode,
    });
  }

  return (
    <AppScreen scroll={false} contentContainerStyle={styles.content}>
      <ScreenHeader
        title={isMenuScan ? 'Scan a menu' : manualMode ? 'Add your meal' : 'Scan your meal'}
        subtitle={
          isMenuScan
            ? 'Capture every page, then we will rank the best and worst options for your gut.'
            : manualMode
              ? 'Take a photo, upload one, or describe what you ate.'
              : 'Clear photo = better insights'
        }
        rightAccessory={
          <Pressable
            onPress={() =>
              Alert.alert(
                isMenuScan ? 'Better menu scans' : 'Better scans',
                isMenuScan
                  ? 'Capture the full menu page, avoid glare, and add every page before analyzing.'
                  : 'Include the full plate, keep the image sharp, and make sure sauces or sides are visible.',
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
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            onCameraReady={() => setCameraReady(true)}
            onMountError={() => setCameraReady(false)}
          />
          <View style={styles.cameraScrim} />

          <View style={styles.previewBadgeLeft}>
            <Ionicons name="flash-outline" size={20} color={palette.white} />
          </View>

          <View style={styles.previewControls}>
            <View style={styles.previewControl}>
              <Ionicons name="flash-outline" size={22} color={palette.white} />
            </View>

            <Pressable
              onPress={() => void capturePhoto()}
              disabled={!cameraReady || capturing}
              style={({ pressed }) => [
                styles.shutterOuter,
                pressed && { transform: [{ scale: 0.96 }] },
                (!cameraReady || capturing) && { opacity: 0.58 },
              ]}
            >
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

      {isMenuScan ? (
        <SectionCard style={styles.menuTrayCard}>
          <View style={styles.menuTrayHeader}>
            <View>
              <Text style={styles.menuTrayTitle}>Menu pages</Text>
              <Text style={styles.menuTraySubtitle}>{menuPages.length ? `${menuPages.length} page${menuPages.length === 1 ? '' : 's'} ready` : 'Add at least one page.'}</Text>
            </View>
            <Pressable onPress={openLibrary} style={({ pressed }) => [styles.addPageButton, pressed && { opacity: 0.82 }]}>
              <Ionicons name="image-outline" size={16} color={palette.primary} />
              <Text style={styles.addPageLabel}>Upload</Text>
            </Pressable>
          </View>
          {menuPages.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuThumbRail}>
              {menuPages.map((page, index) => (
                <View key={page.uri} style={styles.menuThumbWrap}>
                  <Image source={{ uri: page.uri }} style={styles.menuThumb} resizeMode="cover" />
                  <Text style={styles.menuThumbLabel}>Page {index + 1}</Text>
                  <Pressable onPress={() => removeMenuPage(page.uri)} style={styles.removePageButton}>
                    <Ionicons name="close" size={14} color={palette.white} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.menuTrayEmpty}>Take a photo or upload menu screenshots to start.</Text>
          )}
          <PrimaryButton label="Analyze menu" onPress={analyzeMenu} disabled={!menuPages.length} />
        </SectionCard>
      ) : null}

      <View style={styles.actionGrid}>
        <ActionTile icon="camera-outline" label="Take photo" onPress={() => void capturePhoto()} disabled={!permission?.granted || !cameraReady || capturing} tone="green" />
        <ActionTile icon="arrow-up-outline" label="Upload" onPress={openLibrary} tone="coral" />
        {isMenuScan ? null : (
          <ActionTile
            icon="create-outline"
            label="Describe meal"
            onPress={() => navigation.replace('ManualMeal', {})}
            tone="amber"
          />
        )}
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
  menuTrayCard: {
    gap: spacing.md,
  },
  menuTrayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  menuTrayTitle: {
    color: palette.text,
    fontFamily: type.body.bold,
    fontSize: 18,
  },
  menuTraySubtitle: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 13,
  },
  addPageButton: {
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
  addPageLabel: {
    color: palette.primary,
    fontFamily: type.body.bold,
    fontSize: 13,
  },
  menuThumbRail: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  menuThumbWrap: {
    width: 82,
    gap: 5,
    position: 'relative',
  },
  menuThumb: {
    width: 82,
    height: 92,
    borderRadius: radii.md,
    backgroundColor: tokens.color.surface.card.warm,
  },
  menuThumbLabel: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 11,
    textAlign: 'center',
  },
  removePageButton: {
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
  menuTrayEmpty: {
    color: palette.textMuted,
    fontFamily: type.body.medium,
    fontSize: 14,
    lineHeight: 20,
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

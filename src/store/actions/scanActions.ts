import { isLiveBackendConfigured } from '../../config/env';
import { trackEvent } from '../../services/analytics';
import { apiClient } from '../../services/api/client';
import { isEntitledSubscriptionStatus } from '../../features/access/appAccess';
import { analyzeMealInput } from '../../services/ai/scoring';
import { queryClient } from '../../services/query/client';
import { queryKeys } from '../../services/query/keys';
import { uploadMealImage } from '../../services/storage';
import { showToast } from '../../services/toast';
import { ScanRecord } from '../../types/domain';
import { createId } from '../../utils/id';
import { AppStoreState, AppStoreSet, AppStoreGet } from '../types';
import { now, localDateString, currentTimezone, scanCategoryForPayload, removeScanFromHistoryCache, scanRequestId, apiErrorCode, mergeById, rebuildLocalLearningState } from '../helpers';

export function createScanActions(set: AppStoreSet, get: AppStoreGet): Pick<
  AppStoreState,
  'updateScanConsumption' | 'cacheScanRecord' | 'analyzeScanInput' | 'deleteScanRecord'
> {
  return {
      updateScanConsumption: async ({ scanId, consumptionStatus, consumedMenuItemSourceIds }) => {
        const nextStatus = consumptionStatus ?? (consumedMenuItemSourceIds?.length ? 'consumed' : undefined);
        if (nextStatus) {
          set((state) => ({
            scans: state.scans.map((scan) =>
              scan.id === scanId ? { ...scan, consumptionStatus: nextStatus } : scan,
            ),
          }));
        }

        trackEvent('scan_consumption_updated', {
          scan_id: scanId,
          status: nextStatus ?? 'consumed',
          menu_item_count: consumedMenuItemSourceIds?.length ?? 0,
        });

        if (!isLiveBackendConfigured || !get().authUser) {
          return;
        }

        try {
          await apiClient.updateScanConsumption({
            scanId,
            consumptionStatus,
            consumedMenuItemSourceIds,
          });
        } catch (error) {
          console.warn('[scan] consumption update failed', error);
          showToast({
            message: 'Could not save that just now',
            detail: 'No worries — it will not affect your data.',
            tone: 'error',
          });
        }
      },
      cacheScanRecord: (scan) => {
        set((state) => ({
          scans: mergeById(state.scans, scan),
        }));
      },
      analyzeScanInput: async (payload) => {
        const state = get();
        if (!isEntitledSubscriptionStatus(state.billing.subscriptionStatus)) {
          throw new Error('Subscription required before running scans.');
        }

        if (state.billing.tokensRemaining <= 0) {
          throw new Error('You are out of scans for this month. Your allowance refreshes at renewal.');
        }

        const scanStartedAt = now();
        const requestId = scanRequestId(payload);
        const scanCategory = scanCategoryForPayload(payload);
        const requestedScanCategory = payload.scanCategory ?? scanCategory;
        const localDate = payload.localDate ?? localDateString();
        const timezone = payload.timezone ?? currentTimezone();
        trackEvent('scan_started', { request_id: requestId, source_type: payload.sourceType, scan_category: requestedScanCategory, entry_point: payload.sourceType });
        trackEvent('scan_analysis_started', { request_id: requestId, source_type: payload.sourceType, scan_category: requestedScanCategory });

        if (isLiveBackendConfigured && state.authUser) {
          const authUser = state.authUser;
          if (state.initialServerSyncNeeded) {
            await get().syncInitialAccountState();
          }

          try {
            const imageUris = payload.imageUris?.length ? payload.imageUris : payload.imageUri ? [payload.imageUri] : [];
            const imageDataUrls = payload.imageDataUrls?.length
              ? payload.imageDataUrls
              : payload.imageDataUrl
                ? [payload.imageDataUrl]
                : [];
            const imageUploadResults = imageUris.length
              ? (
                  await Promise.all(
                    imageUris.map((imageUri, index) =>
                      uploadMealImage(imageUri, authUser.id, imageDataUrls[index]).catch((error) => {
                        console.warn('[scan] image upload failed; continuing with inline image data.', error);
                        return null;
                      }),
                    ),
                  )
                )
              : [];
            const imagePaths = imageUploadResults
              .map((result) => result?.storagePath)
              .filter((path): path is string => Boolean(path));
            const thumbnailImagePaths = imageUploadResults.map((result) => result?.thumbnailStoragePath ?? null);
            const hasThumbnailImagePaths = thumbnailImagePaths.some((path) => Boolean(path));
            const inlineImageDataUrls = imageDataUrls;
            const inlineImageDataUrl = inlineImageDataUrls[0];
            const response = payload.barcode?.trim()
              ? await apiClient.analyzeBarcode({
                  requestId,
                  barcode: payload.barcode.trim(),
                  sourceType: payload.sourceType,
                  scanCategory: 'grocery',
                  localDate,
                  timezone,
                })
              : imageUris.length || imageDataUrls.length
              ? await apiClient.analyzeImage({
                  requestId,
                  imagePath: imagePaths[0],
                  imagePaths: imagePaths.length > 1 ? imagePaths : undefined,
                  thumbnailImagePaths: hasThumbnailImagePaths ? thumbnailImagePaths : undefined,
                  imageDataUrl: inlineImageDataUrl,
                  imageDataUrls: inlineImageDataUrls.length > 1 ? inlineImageDataUrls : undefined,
                  sourceType: payload.sourceType,
                  scanCategory: requestedScanCategory,
                  localDate,
                  timezone,
                })
              : await apiClient.analyzeText({
                  requestId,
                  text: payload.text?.trim() || 'demo meal with rice and chicken',
                  sourceType: payload.sourceType,
                  scanCategory: requestedScanCategory,
                  localDate,
                  timezone,
                });

            set((currentState) => ({
              scans: mergeById(currentState.scans, response.scan),
              billing: response.billing,
              profile: response.profile ?? currentState.profile,
              insights: response.insights ?? currentState.insights,
              conditionInsights: response.conditionInsights ?? currentState.conditionInsights,
            }));
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: queryKeys.history }),
              queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
              queryClient.invalidateQueries({ queryKey: queryKeys.home }),
            ]);

            trackEvent('scan_analysis_completed', {
              request_id: requestId,
              scan_id: response.scanId,
              deduped: Boolean(response.deduped),
              learning_sync_status: response.learningSyncStatus ?? 'unknown',
              overall_risk_level: response.scan.overallRiskLevel,
              overall_risk_score: response.scan.overallRiskScore,
              token_balance_after: response.billing.tokensRemaining,
            });

            return { scanId: response.scanId };
          } catch (error) {
            trackEvent('scan_analysis_failed', {
              request_id: requestId,
              source_type: payload.sourceType,
              scan_category: requestedScanCategory,
              error_code: apiErrorCode(error),
            });
            throw error;
          }
        }

        const result = analyzeMealInput(payload, get().profile, get().insights);
        const scanId = createId('scan');

        const scan: ScanRecord = {
          id: scanId,
          requestId,
          sourceType: payload.sourceType,
          scanCategory,
          analysisStatus: 'completed',
          tokenCost: 1,
          createdAt: scanStartedAt,
          completedAt: now(),
          inputText: payload.text,
          localDate,
          timezone,
          ...result,
        };

        set((currentState) => ({
          scans: [scan, ...currentState.scans],
          billing: {
            ...currentState.billing,
            tokensRemaining: currentState.billing.tokensRemaining - 1,
          },
          ...rebuildLocalLearningState(currentState, [scan, ...currentState.scans], currentState.dailyReports, 'scan_completed'),
        }));

        trackEvent('scan_analysis_completed', {
          request_id: requestId,
          scan_id: scanId,
          overall_risk_level: result.overallRiskLevel,
          overall_risk_score: result.overallRiskScore,
          token_balance_after: get().billing.tokensRemaining,
        });

        return { scanId };
      },
      deleteScanRecord: async (scanId) => {
        const existingScan = get().scans.find((scan) => scan.id === scanId);

        if (isLiveBackendConfigured && get().authUser) {
          await Promise.all([
            queryClient.cancelQueries({ queryKey: queryKeys.history }),
            queryClient.cancelQueries({ queryKey: queryKeys.scan(scanId) }),
          ]);

          set((state) => ({
            scans: state.scans.filter((scan) => scan.id !== scanId),
          }));
          removeScanFromHistoryCache(scanId);
          queryClient.removeQueries({ queryKey: queryKeys.scan(scanId) });

          trackEvent('history_item_deleted', {
            scan_id: scanId,
            scan_category: existingScan?.scanCategory ?? 'unknown',
            source_type: existingScan?.sourceType ?? 'unknown',
          });

          void (async () => {
            try {
              const response = await apiClient.deleteScan({ scanId });
              set((state) => ({
                profile: response.profile ?? state.profile,
                insights: response.insights ?? state.insights,
                conditionInsights: response.conditionInsights ?? state.conditionInsights,
              }));
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.history }),
                queryClient.invalidateQueries({ queryKey: queryKeys.home }),
                queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
              ]);
              trackEvent('history_item_delete_synced', {
                scan_id: scanId,
                learning_sync_status: response.learningSyncStatus ?? 'unknown',
              });
            } catch (error) {
              const errorCode = apiErrorCode(error);
              if (errorCode === 'scan_not_found') {
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: queryKeys.history }),
                  queryClient.invalidateQueries({ queryKey: queryKeys.home }),
                  queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
                ]);
                trackEvent('history_item_delete_synced', {
                  scan_id: scanId,
                  learning_sync_status: 'not_found',
                });
                return;
              }

              if (existingScan) {
                set((state) => {
                  if (state.scans.some((scan) => scan.id === scanId)) {
                    return state;
                  }

                  return {
                    scans: [existingScan, ...state.scans].sort(
                      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
                    ),
                  };
                });
              }

              await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.history }),
                queryClient.invalidateQueries({ queryKey: queryKeys.home }),
                queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
              ]);
              showToast({
                message: 'Delete failed',
                detail: existingScan ? 'The scan was restored.' : 'Refresh your history and try again.',
                tone: 'error',
              });
              trackEvent('history_item_delete_failed', {
                scan_id: scanId,
                error_code: errorCode,
              });
            }
          })();

          return;
        }

        if (!existingScan) {
          return;
        }

        set((state) => {
          const scans = state.scans.filter((scan) => scan.id !== scanId);
          return {
            scans,
            ...rebuildLocalLearningState(state, scans, state.dailyReports, 'scan_deleted'),
          };
        });

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.history }),
          queryClient.removeQueries({ queryKey: queryKeys.scan(scanId) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.home }),
          queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
        ]);

        trackEvent('history_item_deleted', {
          scan_id: scanId,
          scan_category: existingScan.scanCategory,
          source_type: existingScan.sourceType,
        });
      },
  };
}

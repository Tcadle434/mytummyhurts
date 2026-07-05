import { isLiveBackendConfigured } from '../../config/env';
import { trackEvent } from '../../services/analytics';
import { apiClient } from '../../services/api/client';
import { isEntitledSubscriptionStatus } from '../../features/access/appAccess';
import { queryClient } from '../../services/query/client';
import { queryKeys } from '../../services/query/keys';
import { showToast } from '../../services/toast';
import { AppStoreState, AppStoreSet, AppStoreGet } from '../types';
import {
  localDateString,
  currentTimezone,
  scanCategoryForPayload,
  removeScanFromHistoryCache,
  scanRequestId,
  apiErrorCode,
  learningResponseStatePatch,
  mergeById,
  patchLearningResponseInQueryCaches,
  rebuildLocalLearningState,
  profileWithGutScoreFallback,
} from '../helpers';

export function createScanActions(set: AppStoreSet, get: AppStoreGet): Pick<
  AppStoreState,
  'updateScanConsumption' | 'cacheScanRecord' | 'analyzeScanInput' | 'deleteScanRecord'
> {
  const refreshScanLearning = (scanId: string, eventType: string) => {
    if (!isLiveBackendConfigured || !get().authUser) {
      return;
    }

    void (async () => {
      try {
        const response = await apiClient.learningRecompute({
          sourceType: 'scan',
          sourceId: scanId,
          eventType,
        });

        if (response.learningSyncStatus !== 'updated') {
          trackEvent('learning_recompute_failed', {
            source_type: 'scan',
            source_id: scanId,
            status: response.learningSyncStatus,
            event_type: eventType,
          });
          return;
        }

        patchLearningResponseInQueryCaches(response);
        set((state) => learningResponseStatePatch(state, response));
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.history }),
          queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
          queryClient.invalidateQueries({ queryKey: queryKeys.home }),
        ]);
        trackEvent('learning_recompute_completed', {
          source_type: 'scan',
          source_id: scanId,
          status: response.learningSyncStatus,
          event_type: eventType,
        });
      } catch (error) {
        trackEvent('learning_recompute_failed', {
          source_type: 'scan',
          source_id: scanId,
          error_code: apiErrorCode(error),
          event_type: eventType,
        });
      }
    })();
  };

  return {
      updateScanConsumption: async ({ scanId, consumptionStatus, consumedMenuItemSourceIds, consumptionPortion }) => {
        const nextStatus = consumptionStatus ?? (consumedMenuItemSourceIds?.length ? 'consumed' : undefined);
        if (nextStatus) {
          set((state) => ({
            scans: state.scans.map((scan) =>
              scan.id === scanId
                ? {
                    ...scan,
                    consumptionStatus: nextStatus,
                    // Portion only means something on a consumed meal; keep the
                    // cached record aligned with the server's clearing rule.
                    consumptionPortion:
                      nextStatus === 'consumed'
                        ? (consumptionPortion ?? scan.consumptionPortion)
                        : undefined,
                  }
                : scan,
            ),
          }));
        }

        trackEvent('scan_consumption_updated', {
          scan_id: scanId,
          status: nextStatus ?? 'consumed',
          portion: consumptionPortion ?? 'unset',
          menu_item_count: consumedMenuItemSourceIds?.length ?? 0,
        });

        if (!isLiveBackendConfigured || !get().authUser) {
          return;
        }

        try {
          const response = await apiClient.updateScanConsumption({
            scanId,
            consumptionStatus,
            consumedMenuItemSourceIds,
            consumptionPortion,
          });
          if (response.learningSyncStatus === 'queued') {
            refreshScanLearning(scanId, 'scan_consumption_updated');
          }
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

        const requestId = scanRequestId(payload);
        const scanCategory = scanCategoryForPayload(payload);
        const requestedScanCategory = payload.scanCategory ?? scanCategory;
        const localDate = payload.localDate ?? localDateString();
        const timezone = payload.timezone ?? currentTimezone();
        trackEvent('scan_started', { request_id: requestId, source_type: payload.sourceType, scan_category: requestedScanCategory, entry_point: payload.sourceType });
        trackEvent('scan_analysis_started', { request_id: requestId, source_type: payload.sourceType, scan_category: requestedScanCategory });

        if (isLiveBackendConfigured && state.authUser) {
          if (state.initialServerSyncNeeded) {
            await get().syncInitialAccountState();
          }

          try {
            const imageDataUrls = payload.imageDataUrls?.length
              ? payload.imageDataUrls
              : payload.imageDataUrl
                ? [payload.imageDataUrl]
                : [];
            // The backend persists inline images to object storage (MinIO/S3) and
            // returns the stored imagePath — the client no longer uploads directly.
            const response = payload.barcode?.trim()
              ? await apiClient.analyzeBarcode({
                  requestId,
                  barcode: payload.barcode.trim(),
                  sourceType: payload.sourceType,
                  scanCategory: 'grocery',
                  localDate,
                  timezone,
                })
                : await apiClient.analyzeImage({
                    requestId,
                    imageDataUrls,
                    sourceType: payload.sourceType,
                    scanCategory: requestedScanCategory,
                    localDate,
                    timezone,
                  });

            set((currentState) => {
              const nextInsights = response.insights ?? currentState.insights;
              return {
                scans: mergeById(currentState.scans, response.scan),
                billing: response.billing,
                profile: profileWithGutScoreFallback(response.profile ?? currentState.profile, currentState, nextInsights),
                insights: nextInsights,
                conditionInsights: response.conditionInsights ?? currentState.conditionInsights,
              };
            });
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: queryKeys.history }),
              queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
              queryClient.invalidateQueries({ queryKey: queryKeys.home }),
            ]);
            if (response.learningSyncStatus === 'queued') {
              refreshScanLearning(response.scanId, 'scan_analyzed');
            }

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

        // No live backend / not signed in: scanning requires a server round-trip
        // (the LLM analysis runs server-side). Surface a clear, friendly error
        // instead of fabricating a local result.
        trackEvent('scan_analysis_failed', {
          request_id: requestId,
          source_type: payload.sourceType,
          scan_category: requestedScanCategory,
          error_code: 'offline_unsupported',
        });
        throw new Error('Scanning needs a connection. Please check your internet and try again.');
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
              if (response.learningSyncStatus === 'queued') {
                refreshScanLearning(scanId, 'scan_deleted');
              }
              set((state) => {
                const nextInsights = response.insights ?? state.insights;
                return {
                  profile: profileWithGutScoreFallback(response.profile ?? state.profile, state, nextInsights),
                  insights: nextInsights,
                  conditionInsights: response.conditionInsights ?? state.conditionInsights,
                };
              });
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

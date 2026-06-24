import { isLiveBackendConfigured } from '../../config/env';
import { trackEvent } from '../../services/analytics';
import { apiClient } from '../../services/api/client';
import { buildPayoffBaseline } from '../../features/home/reportPayoff';
import { computeDailyScoreForReport } from '../../services/ai/scoring';
import { queryClient } from '../../services/query/client';
import { queryKeys } from '../../services/query/keys';
import { DailyGutReport } from '../../types/domain';
import { createId } from '../../utils/id';
import { AppStoreState, AppStoreSet, AppStoreGet } from '../types';
import {
  now,
  apiErrorCode,
  learningResponseStatePatch,
  mergeById,
  mergeDailyReportByLocalDate,
  patchDailyReportInQueryCaches,
  patchLearningResponseInQueryCaches,
  pollHomeSnapshotUntilIdle,
  rebuildLocalLearningState,
} from '../helpers';

export function createReportActions(set: AppStoreSet, get: AppStoreGet): Pick<
  AppStoreState,
  'clearReportPayoffBaseline' | 'upsertDailyReport'
> {
  return {
      clearReportPayoffBaseline: () => {
        set({ reportPayoffBaseline: null });
      },
      upsertDailyReport: async ({ localDate, gutSeverity, symptomTags = [], notes, evidenceQuality }) => {
        const normalizedSymptomTags = gutSeverity === 0
          ? ['None']
          : symptomTags.filter((tag) => tag.trim().toLowerCase() !== 'none');
        // Snapshot the pre-report state so the payoff screen can show what this
        // report changed once the learning recompute lands.
        set((currentState) => ({
          reportPayoffBaseline: buildPayoffBaseline({
            localDate,
            gutScore: currentState.profile?.stomachProfile.metadata.gutScore ?? null,
            insights: currentState.insights,
          }),
        }));
        const authUser = get().authUser;
        const fallbackPollDailyReportLearning = async (reportId: string) => {
          try {
            const finalHome = await pollHomeSnapshotUntilIdle(get().applyHomeResponse);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: queryKeys.history }),
              queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
              queryClient.invalidateQueries({ queryKey: queryKeys.home }),
            ]);

            if (!finalHome) {
              set({
                learningSyncInFlight: false,
                learningSyncRequestId: null,
                learningSyncError: 'Daily report saved, but Gut Score refresh is still catching up.',
                learningSyncSource: null,
              });
              return;
            }

            trackEvent('learning_recompute_completed', {
              source_type: 'daily_gut_report',
              source_id: reportId,
              status: finalHome.learningStatus,
            });
          } catch (pollError) {
            console.warn('[learning] home snapshot polling failed', pollError);
            set({
              learningSyncInFlight: false,
              learningSyncRequestId: null,
              learningSyncError: 'Daily report saved, but Gut Score refresh is still catching up.',
              learningSyncSource: null,
            });
          }
        };
        const refreshDailyReportLearning = async (reportId: string) => {
          try {
            const learningResponse = await apiClient.learningRecompute({
              sourceType: 'daily_gut_report',
              sourceId: reportId,
            });

            if (learningResponse.learningSyncStatus !== 'updated') {
              throw new Error(`learning_recompute_${learningResponse.learningSyncStatus}`);
            }

            patchLearningResponseInQueryCaches(learningResponse);
            set((currentState) => {
              if (currentState.learningSyncRequestId !== reportId) {
                return currentState;
              }

              return {
                ...learningResponseStatePatch(currentState, learningResponse),
                learningSyncInFlight: false,
                learningSyncRequestId: null,
                learningSyncError: null,
                learningSyncSource: null,
              };
            });
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: queryKeys.history }),
              queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
              queryClient.invalidateQueries({ queryKey: queryKeys.home }),
            ]);
            trackEvent('learning_recompute_completed', {
              source_type: 'daily_gut_report',
              source_id: reportId,
              status: learningResponse.learningSyncStatus,
            });
          } catch (learningError) {
            console.warn('[learning] daily report recompute failed, falling back to queue polling', learningError);
            trackEvent('learning_recompute_failed', {
              source_type: 'daily_gut_report',
              source_id: reportId,
              error_code: apiErrorCode(learningError),
            });
            await fallbackPollDailyReportLearning(reportId);
          }
        };

        if (isLiveBackendConfigured && authUser) {
          const state = get();
          const existing = state.dailyReports.find((report) => report.localDate === localDate);
          const timestamp = now();
          const optimisticReport = computeDailyScoreForReport(
            {
              id: existing?.id ?? createId('report'),
              userId: authUser.id,
              localDate,
              gutSeverity,
              symptomTags: normalizedSymptomTags,
              evidenceQuality,
              notes: notes?.trim() || undefined,
              createdAt: existing?.createdAt ?? timestamp,
              updatedAt: timestamp,
            },
            state.scans,
            timestamp,
          );

          set((currentState) => ({
            dailyReports: mergeDailyReportByLocalDate(currentState.dailyReports, optimisticReport).sort(
              (left, right) => new Date(right.localDate).getTime() - new Date(left.localDate).getTime(),
            ),
            learningSyncInFlight: true,
            learningSyncRequestId: optimisticReport.id,
            learningSyncError: null,
            learningSyncSource: 'daily_report',
          }));
          // Do NOT invalidate the home query here. The recompute has not been
          // enqueued yet, so a refetch would read the pre-report snapshot
          // (learningStatus 'idle') and applyHomeResponse would flip
          // learningSyncInFlight back to false — bouncing the payoff screen out
          // of its loading state to a stale score and then back to loading once
          // the upsert response lands. Home is refreshed after the response
          // below, once the snapshot reports 'pending'.
          void queryClient.invalidateQueries({ queryKey: queryKeys.history });
          const response = await apiClient.upsertDailyReport({
            localDate,
            gutSeverity,
            symptomTags: normalizedSymptomTags,
            notes,
            evidenceQuality,
          }).catch((error) => {
            set((currentState) => {
              if (currentState.learningSyncRequestId !== optimisticReport.id) {
                return currentState;
              }

              const dailyReports = existing
                ? mergeDailyReportByLocalDate(currentState.dailyReports, existing)
                : currentState.dailyReports.filter((report) => report.localDate !== localDate);

              return {
                dailyReports,
                learningSyncInFlight: false,
                learningSyncRequestId: null,
                learningSyncError: error instanceof Error ? error.message : 'Daily report could not be saved.',
                learningSyncSource: null,
              };
            });
            trackEvent('daily_gut_report_save_failed', {
              local_date: localDate,
              error_code: apiErrorCode(error),
            });
            throw error;
          });

          const learningSyncError =
            response.learningSyncStatus === 'failed'
              ? 'Daily report saved, but learning refresh could not be queued.'
              : null;
          const learningIsQueued = response.learningSyncStatus === 'queued';
          patchDailyReportInQueryCaches(response.report);

          set((currentState) => ({
            dailyReports: mergeDailyReportByLocalDate(currentState.dailyReports, response.report).sort(
              (left, right) => new Date(right.localDate).getTime() - new Date(left.localDate).getTime(),
            ),
            learningSyncInFlight: learningIsQueued,
            learningSyncRequestId: learningIsQueued ? response.report.id : null,
            learningSyncError,
            learningSyncSource: learningIsQueued ? ('daily_report' as const) : null,
          }));
          void Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.history }),
            queryClient.invalidateQueries({ queryKey: queryKeys.home }),
          ]);

          trackEvent('learning_recompute_queued', {
            source_type: 'daily_gut_report',
            source_id: response.report.id,
            status: response.learningSyncStatus,
          });

          const components = response.report.dailyScoreComponents;
          if (components && components.evidenceWeight > 0) {
            const predictedRisk = 100 - components.foodExposure;
            trackEvent('prediction_outcome_recorded', {
              local_date: localDate,
              reported_severity: gutSeverity,
              evidence_weight: components.evidenceWeight,
              evidence_quality: evidenceQuality ?? 'typical',
              predicted_risk: predictedRisk,
              predicted_risk_band: predictedRisk >= 64 ? 'high' : predictedRisk >= 37 ? 'medium' : 'low',
              false_reassurance: gutSeverity >= 7 && predictedRisk <= 36,
            });
          }

          if (learningIsQueued) {
            void refreshDailyReportLearning(response.report.id);
          }
        } else {
          const existing = get().dailyReports.find((report) => report.localDate === localDate);
          const timestamp = now();
          const report: DailyGutReport = {
            id: existing?.id ?? createId('report'),
            userId: get().authUser?.id ?? 'local-user',
            localDate,
            gutSeverity,
            symptomTags: normalizedSymptomTags,
            notes: notes?.trim() || undefined,
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
          };

          set((state) => {
            const dailyReports = mergeById(state.dailyReports, report).sort(
              (left, right) => new Date(right.localDate).getTime() - new Date(left.localDate).getTime(),
            );

            return {
              ...rebuildLocalLearningState(
                state,
                state.scans,
                dailyReports,
                gutSeverity <= 3 ? 'calm_daily_report' : gutSeverity >= 7 ? 'reactive_daily_report' : 'neutral_daily_report',
              ),
            };
          });
        }

        if (!isLiveBackendConfigured || !get().authUser) {
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.history }),
            queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
            queryClient.invalidateQueries({ queryKey: queryKeys.home }),
          ]);
        }

        trackEvent('daily_gut_report_saved', {
          local_date: localDate,
          gut_severity: gutSeverity,
          tags_count: normalizedSymptomTags.length,
        });
      },
  };
}

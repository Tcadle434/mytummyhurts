import { isLiveBackendConfigured } from '../../config/env';
import { trackEvent } from '../../services/analytics';
import { apiClient } from '../../services/api/client';
import { queryClient } from '../../services/query/client';
import { queryKeys } from '../../services/query/keys';
import { createId } from '../../utils/id';
import { AppStoreState, AppStoreSet, AppStoreGet } from '../types';
import {
  apiErrorCode,
  learningResponseStatePatch,
  sleep,
} from '../helpers';
import { patchLearningResponseInQueryCaches } from '../queryCacheHelpers';

export function createLearningActions(set: AppStoreSet, get: AppStoreGet): Pick<
  AppStoreState,
  'triggerLearningRecompute'
> {
  return {
      triggerLearningRecompute: (request) => {
        if (!isLiveBackendConfigured || !get().authUser) {
          return;
        }

        const syncRequestId = createId('learning-sync');
        set({
          learningSyncInFlight: true,
          learningSyncRequestId: syncRequestId,
          learningSyncError: null,
          learningSyncSource: 'recompute',
        });

        const run = async (attempt = 0): Promise<void> => {
          try {
            const response = await apiClient.learningRecompute(request);

            if (response.learningSyncStatus === 'locked' && attempt === 0) {
              await sleep(1000);
              return run(1);
            }

            if (response.learningSyncStatus === 'updated') {
              patchLearningResponseInQueryCaches(response);

              set((state) => {
                if (state.learningSyncRequestId !== syncRequestId) {
                  return state;
                }

                return {
                  ...learningResponseStatePatch(state, response),
                };
              });

              await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.history }),
                queryClient.invalidateQueries({ queryKey: queryKeys.insights }),
                queryClient.invalidateQueries({ queryKey: queryKeys.home }),
              ]);
            }

            if (response.learningSyncStatus === 'failed' || response.learningSyncStatus === 'locked') {
              trackEvent('learning_recompute_failed', {
                source_type: request.sourceType,
                source_id: request.sourceId,
                status: response.learningSyncStatus,
              });
            }
          } catch (error) {
            trackEvent('learning_recompute_failed', {
              source_type: request.sourceType,
              source_id: request.sourceId,
              error_code: apiErrorCode(error),
            });
            set((state) =>
              state.learningSyncRequestId === syncRequestId
                ? {
                    learningSyncError:
                      error instanceof Error ? error.message : 'Learning refresh could not be completed.',
                  }
                : state,
            );
          } finally {
            set((state) =>
              state.learningSyncRequestId === syncRequestId
                ? {
                    learningSyncInFlight: false,
                    learningSyncRequestId: null,
                    learningSyncSource: null,
                  }
                : state,
            );
          }
        };

        void run();
      },
  };
}

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

import { errorMetadata, recordSystemEvent } from './observability.ts';
import { OperationLockBusyError, rebuildInsightsAndProfile } from './profile.ts';

export type LearningJobSourceType = 'daily_gut_report' | 'scan' | 'profile' | 'scheduled_maintenance';

type LearningJobStatus = 'pending' | 'running' | 'completed' | 'failed';

type LearningJobRow = {
  id: string;
  user_id: string;
  event_type: string;
  source_type: LearningJobSourceType | string;
  source_id: string | null;
  status: LearningJobStatus;
  run_after: string;
  locked_at: string | null;
  locked_by: string | null;
  completed_at: string | null;
  failed_at: string | null;
  attempt_count: number;
  last_error: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type LearningJobEnqueueInput = {
  userId: string;
  eventType: string;
  sourceType: LearningJobSourceType;
  sourceId?: string | null;
  runAfterSeconds?: number;
  metadata?: Record<string, unknown>;
};

export type ProcessLearningJobsResult = {
  claimed: number;
  completed: number;
  retried: number;
  skippedLocked: number;
  failed: number;
};

function retryDelaySeconds(attemptCount: number) {
  if (attemptCount <= 1) {
    return 60;
  }

  if (attemptCount === 2) {
    return 5 * 60;
  }

  if (attemptCount === 3) {
    return 15 * 60;
  }

  return 60 * 60;
}

function nextRunAfter(attemptCount: number) {
  return new Date(Date.now() + retryDelaySeconds(attemptCount) * 1000).toISOString();
}

export async function enqueueLearningJob(admin: SupabaseClient, input: LearningJobEnqueueInput) {
  const { data, error } = await admin.rpc('enqueue_learning_job', {
    p_user_id: input.userId,
    p_event_type: input.eventType,
    p_source_type: input.sourceType,
    p_source_id: input.sourceId ?? null,
    p_run_after_seconds: input.runAfterSeconds ?? 45,
    p_metadata: input.metadata ?? {},
  });

  if (error) {
    throw error;
  }

  return data as LearningJobRow;
}

async function markJobCompleted(admin: SupabaseClient, job: LearningJobRow) {
  const { error } = await admin
    .from('learning_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  if (error) {
    throw error;
  }
}

async function rescheduleJob(
  admin: SupabaseClient,
  job: LearningJobRow,
  error: unknown,
  options: { locked?: boolean } = {},
) {
  const { error: updateError } = await admin
    .from('learning_jobs')
    .update({
      status: 'pending',
      run_after: nextRunAfter(job.attempt_count),
      locked_at: null,
      locked_by: null,
      last_error: error instanceof Error ? error.message : String(error),
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  if (updateError) {
    throw updateError;
  }

  await recordSystemEvent(admin, {
    eventType: options.locked ? 'learning_job_rescheduled_lock_busy' : 'learning_job_retry_scheduled',
    severity: 'warn',
    userId: job.user_id,
    operation: 'learning_job',
    entityType: job.source_type,
    entityId: job.source_id ?? undefined,
    metadata: {
      jobId: job.id,
      attemptCount: job.attempt_count,
      error: errorMetadata(error),
    },
  });
}

async function markJobFailed(admin: SupabaseClient, job: LearningJobRow, error: unknown) {
  const { error: updateError } = await admin
    .from('learning_jobs')
    .update({
      status: 'failed',
      failed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      last_error: error instanceof Error ? error.message : String(error),
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  if (updateError) {
    throw updateError;
  }

  await recordSystemEvent(admin, {
    eventType: 'learning_job_failed',
    severity: 'error',
    userId: job.user_id,
    operation: 'learning_job',
    entityType: job.source_type,
    entityId: job.source_id ?? undefined,
    metadata: {
      jobId: job.id,
      attemptCount: job.attempt_count,
      error: errorMetadata(error),
    },
  });
}

export async function processDueLearningJobs(
  admin: SupabaseClient,
  options: { limit?: number; workerId?: string; maxAttempts?: number } = {},
): Promise<ProcessLearningJobsResult> {
  const limit = Math.min(100, Math.max(1, Number(options.limit ?? 25)));
  const workerId = options.workerId ?? `learning-worker:${crypto.randomUUID()}`;
  const maxAttempts = Math.max(1, Number(options.maxAttempts ?? 5));

  const { data, error } = await admin.rpc('claim_due_learning_jobs', {
    p_limit: limit,
    p_worker_id: workerId,
  });

  if (error) {
    throw error;
  }

  const jobs = (data ?? []) as LearningJobRow[];
  const result: ProcessLearningJobsResult = {
    claimed: jobs.length,
    completed: 0,
    retried: 0,
    skippedLocked: 0,
    failed: 0,
  };

  for (const job of jobs) {
    try {
      await rebuildInsightsAndProfile(admin, job.user_id, {
        eventType: job.event_type,
        sourceType: job.source_type,
        sourceId: job.source_id ?? undefined,
        skipIfLocked: true,
      });
      await markJobCompleted(admin, job);
      result.completed += 1;
    } catch (error) {
      if (error instanceof OperationLockBusyError) {
        await rescheduleJob(admin, job, error, { locked: true });
        result.skippedLocked += 1;
        continue;
      }

      if (job.attempt_count >= maxAttempts) {
        await markJobFailed(admin, job, error);
        result.failed += 1;
        continue;
      }

      await rescheduleJob(admin, job, error);
      result.retried += 1;
    }
  }

  return result;
}

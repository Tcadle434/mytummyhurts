import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

type SystemEventSeverity = 'debug' | 'info' | 'warn' | 'error';

export async function recordSystemEvent(
  admin: SupabaseClient,
  event: {
    eventType: string;
    severity?: SystemEventSeverity;
    userId?: string | null;
    operation?: string;
    entityType?: string;
    entityId?: string;
    requestId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const payload = {
    event_type: event.eventType,
    severity: event.severity ?? 'info',
    user_id: event.userId ?? null,
    operation: event.operation ?? null,
    entity_type: event.entityType ?? null,
    entity_id: event.entityId ?? null,
    request_id: event.requestId ?? null,
    metadata: event.metadata ?? {},
  };

  console.log('[system-event]', payload);

  const { error } = await admin.from('system_events').insert(payload);
  if (error) {
    console.warn('[system-event] insert failed', error);
  }
}

export function errorMetadata(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  return {
    message: String(error),
  };
}

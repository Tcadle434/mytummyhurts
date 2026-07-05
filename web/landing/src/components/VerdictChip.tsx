export type Verdict = 'confirmed' | 'suspect' | 'watching' | 'safe' | 'cleared';

const VERDICT_LABELS: Record<Verdict, string> = {
  confirmed: 'Confirmed',
  suspect: 'Suspect',
  watching: 'Watching',
  safe: 'Looking safe',
  cleared: 'Cleared',
};

const VERDICT_CLASSES: Record<Verdict, string> = {
  confirmed: 'bg-confirmed-bg text-confirmed-fg',
  suspect: 'bg-suspect-bg text-suspect-fg',
  watching: 'bg-watching-bg text-watching-fg',
  safe: 'bg-safe-bg text-safe-fg',
  cleared: 'bg-cleared-bg text-cleared-fg',
};

const VERDICT_DOTS: Record<Verdict, string> = {
  confirmed: 'bg-confirmed-tint',
  suspect: 'bg-suspect-tint',
  watching: 'bg-watching-tint',
  safe: 'bg-safe-tint',
  cleared: 'bg-cleared-tint',
};

export function VerdictChip({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${VERDICT_CLASSES[verdict]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${VERDICT_DOTS[verdict]}`} />
      {VERDICT_LABELS[verdict]}
    </span>
  );
}

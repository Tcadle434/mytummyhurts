export const DAILY_CHECKIN_CATEGORY = 'daily_checkin';
export const DAILY_CHECKIN_TYPE = 'daily_checkin';
// Legacy: weekly report pushes were removed; the type only identifies
// leftover scheduled notifications from older builds so they can be cancelled.
export const WEEKLY_REPORT_TYPE = 'weekly_report';

export const CHECKIN_ACTION_CALM = 'daily_checkin_calm';
export const CHECKIN_ACTION_MEH = 'daily_checkin_meh';
export const CHECKIN_ACTION_ROUGH = 'daily_checkin_rough';

export const DEFAULT_CHECKIN_HOUR = 20;
export const DEFAULT_CHECKIN_MINUTE = 30;

// One-tap answers map onto the existing 0-10 severity scale. The learning
// pipeline buckets severity into calm (<=3) / neutral (4-6) / reactive (>=7),
// so three buttons carry the full signal trigger attribution consumes; the
// in-app slider remains the full-fidelity path.
export function severityForCheckinAction(actionIdentifier: string): number | null {
  switch (actionIdentifier) {
    case CHECKIN_ACTION_CALM:
      return 2;
    case CHECKIN_ACTION_MEH:
      return 5;
    case CHECKIN_ACTION_ROUGH:
      return 8;
    default:
      return null;
  }
}

export function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type DailyCheckinSlot = {
  localDate: string;
  fireAt: Date;
  isToday: boolean;
};

// Plans the next batch of local check-in notifications. Pure so it can be
// unit-tested: today's slot is skipped once reported or once the preferred
// time has passed; future days are always scheduled (reports can't exist yet).
export function planDailyCheckinSchedule(params: {
  now: Date;
  reportedDates: ReadonlySet<string>;
  preferredHour?: number;
  preferredMinute?: number;
  days?: number;
}): DailyCheckinSlot[] {
  const {
    now,
    reportedDates,
    preferredHour = DEFAULT_CHECKIN_HOUR,
    preferredMinute = DEFAULT_CHECKIN_MINUTE,
    days = 7,
  } = params;

  const slots: DailyCheckinSlot[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const fireAt = new Date(now);
    fireAt.setDate(fireAt.getDate() + offset);
    fireAt.setHours(preferredHour, preferredMinute, 0, 0);

    if (fireAt.getTime() <= now.getTime()) {
      continue;
    }

    const localDate = localDateString(fireAt);
    if (reportedDates.has(localDate)) {
      continue;
    }

    slots.push({ localDate, fireAt, isToday: offset === 0 });
  }

  return slots;
}

export type DailyCheckinContent = {
  title: string;
  body: string;
};

// Scan-aware copy is only possible for today's slot (we know what was scanned
// so far); the scheduler re-runs after every scan so tonight's copy stays
// fresh. Future days fall back to the generic line.
export function buildDailyCheckinContent(params: {
  isToday: boolean;
  scanTitle?: string | null;
}): DailyCheckinContent {
  if (params.isToday && params.scanTitle) {
    return {
      title: 'How did your gut feel today?',
      body: `You scanned ${params.scanTitle} today — did it sit okay? One tap logs it.`,
    };
  }

  return {
    title: 'How did your gut feel today?',
    body: 'A 10-second check-in keeps your Gut Score honest and your triggers accurate.',
  };
}

// Most recent food scan for a given local date, used for scan-aware copy.
export function latestScanTitleForDate(
  scans: { dishName?: string; createdAt: string; scanCategory?: string }[],
  localDate: string,
): string | null {
  const matching = scans
    .filter((scan) => (scan.scanCategory ?? 'food') !== 'menu')
    .filter((scan) => localDateString(new Date(scan.createdAt)) === localDate)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  const title = matching[0]?.dishName?.trim();
  return title ? title : null;
}

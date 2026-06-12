import { describe, expect, it } from 'vitest';

import {
  CHECKIN_ACTION_CALM,
  CHECKIN_ACTION_MEH,
  CHECKIN_ACTION_ROUGH,
  buildDailyCheckinContent,
  latestScanTitleForDate,
  localDateString,
  planDailyCheckinSchedule,
  severityForCheckinAction,
} from '../dailyCheckin';

describe('severityForCheckinAction', () => {
  it('maps the three actions onto the severity scale bands the learning loop uses', () => {
    expect(severityForCheckinAction(CHECKIN_ACTION_CALM)).toBe(2);
    expect(severityForCheckinAction(CHECKIN_ACTION_MEH)).toBe(5);
    expect(severityForCheckinAction(CHECKIN_ACTION_ROUGH)).toBe(8);
    expect(severityForCheckinAction('expo.modules.notifications.actions.DEFAULT')).toBeNull();
  });
});

describe('planDailyCheckinSchedule', () => {
  const baseParams = {
    preferredHour: 20,
    preferredMinute: 30,
    reportedDates: new Set<string>(),
  };

  it("schedules today when the preferred time hasn't passed", () => {
    const now = new Date(2026, 5, 10, 9, 0, 0);
    const slots = planDailyCheckinSchedule({ ...baseParams, now });

    expect(slots).toHaveLength(7);
    expect(slots[0]).toMatchObject({ localDate: '2026-06-10', isToday: true });
    expect(slots[0]!.fireAt.getHours()).toBe(20);
    expect(slots[0]!.fireAt.getMinutes()).toBe(30);
  });

  it('skips today once the preferred time has passed', () => {
    const now = new Date(2026, 5, 10, 21, 0, 0);
    const slots = planDailyCheckinSchedule({ ...baseParams, now });

    expect(slots[0]).toMatchObject({ localDate: '2026-06-11', isToday: false });
    expect(slots).toHaveLength(6);
  });

  it('skips dates that already have a report', () => {
    const now = new Date(2026, 5, 10, 9, 0, 0);
    const slots = planDailyCheckinSchedule({
      ...baseParams,
      now,
      reportedDates: new Set(['2026-06-10']),
    });

    expect(slots[0]!.localDate).toBe('2026-06-11');
  });
});

describe('buildDailyCheckinContent', () => {
  it('references the scanned meal for today when available', () => {
    const content = buildDailyCheckinContent({ isToday: true, scanTitle: 'Carbonara' });
    expect(content.body).toContain('Carbonara');
  });

  it('falls back to the generic line for future days', () => {
    const content = buildDailyCheckinContent({ isToday: false, scanTitle: 'Carbonara' });
    expect(content.body).not.toContain('Carbonara');
  });
});

describe('latestScanTitleForDate', () => {
  it('returns the most recent non-menu scan title for the date', () => {
    const localDate = localDateString(new Date(2026, 5, 10, 12, 0, 0));
    const title = latestScanTitleForDate(
      [
        { dishName: 'Oatmeal', createdAt: new Date(2026, 5, 10, 8, 0, 0).toISOString() },
        { dishName: 'Carbonara', createdAt: new Date(2026, 5, 10, 12, 30, 0).toISOString() },
        { dishName: 'Sushi Menu', createdAt: new Date(2026, 5, 10, 19, 0, 0).toISOString(), scanCategory: 'menu' },
        { dishName: 'Old Pizza', createdAt: new Date(2026, 5, 9, 12, 0, 0).toISOString() },
      ],
      localDate,
    );

    expect(title).toBe('Carbonara');
  });
});

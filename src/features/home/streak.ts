function localDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Engagement streak: a day counts if the user scanned anything OR filed a
// daily report. One missed day is forgiven (the streak bridges a single gap);
// today never breaks the streak because the day isn't over yet.
export function computeEngagementStreak(params: {
  scans: { createdAt: string }[];
  reports: { localDate: string }[];
  now?: Date;
}): number {
  const activeDays = new Set<string>();
  for (const scan of params.scans) {
    const parsed = new Date(scan.createdAt);
    if (!Number.isNaN(parsed.getTime())) {
      activeDays.add(localDayKey(parsed));
    }
  }
  for (const report of params.reports) {
    if (report.localDate) {
      activeDays.add(report.localDate);
    }
  }

  if (activeDays.size === 0) {
    return 0;
  }

  const cursor = new Date(params.now ?? new Date());
  cursor.setHours(0, 0, 0, 0);

  let streak = 0;
  let graceUsed = false;

  if (activeDays.has(localDayKey(cursor))) {
    streak += 1;
  }
  // Whether or not today is active, continue counting from yesterday.
  cursor.setDate(cursor.getDate() - 1);

  // Bounded walk: at most one gap day is bridged, so the loop ends naturally.
  for (;;) {
    if (activeDays.has(localDayKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }

    if (!graceUsed && streak > 0) {
      graceUsed = true;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }

    break;
  }

  return streak;
}

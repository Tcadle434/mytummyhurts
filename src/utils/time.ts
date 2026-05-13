export function localDaypartGreeting(date = new Date()): 'Good morning' | 'Good afternoon' | 'Good evening' {
  const hour = date.getHours();

  if (hour < 12) {
    return 'Good morning';
  }

  if (hour < 17) {
    return 'Good afternoon';
  }

  return 'Good evening';
}

export function relativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return 'JUST NOW';
  if (minutes < 60) return `${minutes}M AGO`;
  if (hours < 24) return `${hours}H AGO`;
  if (days === 1) return 'YESTERDAY';
  return `${days}D AGO`;
}

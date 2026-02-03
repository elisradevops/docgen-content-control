export function toTimestamp(dateLike: any): number {
  if (!dateLike) return 0;
  const t = new Date(dateLike).getTime();
  return isNaN(t) ? 0 : t;
}

export function formatLocalIL(dateLike: string | Date | undefined | null): string {
  if (!dateLike) return '';
  try {
    const date = new Date(dateLike);
    return date.toLocaleString('en-IL', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return '';
  }
}

export function formatLocalILShort(dateLike: string | Date | undefined | null): string {
  if (!dateLike) return '';
  try {
    const date = new Date(dateLike);
    if (isNaN(date.getTime())) return '';
    if (date.getFullYear() < 1970) return '';
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
    return formatted.replace(',', '');
  } catch {
    return '';
  }
}

export function buildReleaseRunChangeComparator<T>(
  getReleaseVersion: (item: T) => string,
  getReleaseRunDate: (item: T) => any,
  getChangeDate: (item: T) => any
): (a: T, b: T) => number {
  return (a: T, b: T) => {
    const rvA = getReleaseVersion(a) || '';
    const rvB = getReleaseVersion(b) || '';
    if (rvA !== rvB) {
      return rvB.localeCompare(rvA, undefined, { numeric: true, sensitivity: 'base' });
    }
    const rrA = toTimestamp(getReleaseRunDate(a));
    const rrB = toTimestamp(getReleaseRunDate(b));
    if (rrA !== rrB) return rrB - rrA;

    const cA = toTimestamp(getChangeDate(a));
    const cB = toTimestamp(getChangeDate(b));
    return cB - cA;
  };
}

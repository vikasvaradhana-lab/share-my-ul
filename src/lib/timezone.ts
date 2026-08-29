// ============================================================
// Timezone utilities using Intl API (built-in, no extra deps)
// All internal storage is UTC. Display/validation uses IANA tz.
// ============================================================

export const STOCKHOLM_TZ = 'Europe/Stockholm';
export const KOLKATA_TZ = 'Asia/Kolkata';

/**
 * Format a UTC date for display in a given IANA timezone.
 */
export function formatInTz(
  date: Date,
  tz: string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: tz,
    ...options,
  }).format(date);
}

/**
 * Get the local wall-clock date components for a UTC date in a given tz.
 * Returns { year, month (1-12), day, hours, minutes }.
 */
export function getLocalComponents(
  date: Date,
  tz: string
): { year: number; month: number; day: number; hours: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hours: get('hour'),
    minutes: get('minute'),
  };
}

/**
 * Given a local date string (YYYY-MM-DD) and a time string (HH:MM)
 * in a specific IANA timezone, return the equivalent UTC Date.
 */
export function localToUtc(dateStr: string, timeStr: string, tz: string): Date {
  // We construct an ISO string "YYYY-MM-DDTHH:MM:00" and interpret it in the tz.
  // Technique: use Temporal-style approach via Date constructor + offset calculation.
  const naive = new Date(`${dateStr}T${timeStr}:00`);
  // Get the UTC time of midnight local, via a trick:
  const utcStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  // We use a binary-search-free approach: generate a UTC Date for the given local time.
  // Step 1: parse the naive timestamp as UTC
  const naiveUTC = Date.UTC(
    parseInt(dateStr.slice(0, 4)),
    parseInt(dateStr.slice(5, 7)) - 1,
    parseInt(dateStr.slice(8, 10)),
    parseInt(timeStr.slice(0, 2)),
    parseInt(timeStr.slice(3, 5)),
    0,
    0
  );
  // Step 2: find the offset at that approximate time by formatting a Date at naiveUTC in the tz
  const approx = new Date(naiveUTC);
  const parts = utcStr.formatToParts(approx);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
  const localY = get('year');
  const localM = get('month') - 1;
  const localD = get('day');
  const localH = get('hour') === 24 ? 0 : get('hour');
  const localMin = get('minute');
  const localS = get('second');

  // Step 3: compute the actual offset
  const localAsUTC = Date.UTC(localY, localM, localD, localH, localMin, localS);
  const offset = localAsUTC - naiveUTC;

  // Step 4: subtract the offset to get the real UTC time
  return new Date(naiveUTC - offset);
}

/**
 * Format a UTC date as "HH:MM" in Europe/Stockholm.
 */
export function toStockholmTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: STOCKHOLM_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Format a UTC date as "HH:MM" in Asia/Kolkata.
 */
export function toKolkataTime(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: KOLKATA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Format a date as a friendly display string in Stockholm time.
 * e.g. "Monday, 2 September 2026"
 */
export function formatDateStockholm(date: Date): string {
  return new Intl.DateTimeFormat('en-SE', {
    timeZone: STOCKHOLM_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/**
 * Format a date as short "Mon 2 Sep" in Stockholm time.
 */
export function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat('en-SE', {
    timeZone: STOCKHOLM_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
}

/**
 * Get Stockholm calendar date (YYYY-MM-DD) for a UTC date.
 */
export function stockholmDateStr(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STOCKHOLM_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Check if a UTC timestamp falls within the admin's awake window.
 * awakeStart/awakeEnd are "HH:MM" strings in the admin timezone.
 */
export function isInAwakeWindow(
  utcDate: Date,
  awakeStart: string, // "HH:MM"
  awakeEnd: string,   // "HH:MM"
  adminTz: string
): boolean {
  const { hours, minutes } = getLocalComponents(utcDate, adminTz);
  const timeMinutes = hours * 60 + minutes;
  const [sh, sm] = awakeStart.split(':').map(Number);
  const [eh, em] = awakeEnd.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  return timeMinutes >= startMin && timeMinutes <= endMin;
}

/**
 * Given a local date string in Stockholm time ("YYYY-MM-DD"),
 * return a Date representing midnight (00:00) in Stockholm.
 */
export function stockholmMidnight(dateStr: string): Date {
  return localToUtc(dateStr, '00:00', STOCKHOLM_TZ);
}

/**
 * Get an array of date strings (YYYY-MM-DD in Stockholm tz)
 * from startDate to endDate (inclusive).
 */
export function getDateRange(startDate: Date, endDate: Date): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  // Start at beginning of Stockholm day
  const endStr = stockholmDateStr(endDate);

  while (true) {
    const str = stockholmDateStr(current);
    dates.push(str);
    if (str === endStr) break;
    current.setUTCDate(current.getUTCDate() + 1);
    if (dates.length > 400) break; // safety
  }
  return dates;
}

/**
 * Get the day-of-week in Stockholm time (0=Sun, 1=Mon, ... 3=Wed, 5=Fri).
 */
export function getDayOfWeek(dateStr: string): number {
  // dateStr: "YYYY-MM-DD"
  // We need to get the weekday in Stockholm timezone.
  // Since dateStr is already a Stockholm date, we can use:
  const d = stockholmMidnight(dateStr);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: STOCKHOLM_TZ,
    weekday: 'narrow',
  }).formatToParts(d);
  // Use a different approach: get day number
  const dayFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: STOCKHOLM_TZ,
    weekday: 'long',
  }).format(d);
  const days: Record<string, number> = {
    Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
    Thursday: 4, Friday: 5, Saturday: 6,
  };
  return days[dayFmt] ?? 0;
}

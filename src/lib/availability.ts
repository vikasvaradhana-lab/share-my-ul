// ============================================================
// Booking availability logic
// All inputs/outputs use UTC Dates.
// Stockholm display handled by callers.
// ============================================================

import type { PublicBlock, Settings, BookingOption } from '@/types';
import { isInAwakeWindow, getDayOfWeek, stockholmMidnight, stockholmDateStr, localToUtc, STOCKHOLM_TZ } from './timezone';

const DURATIONS: Array<12 | 24> = [12, 24];

/** 30 minutes in milliseconds */
const STEP_MS = 30 * 60 * 1000;

/**
 * Determine the default status for a date (YYYY-MM-DD Stockholm)
 * based on recurring rules in settings.
 */
export function getDefaultStatus(
  dateStr: string,
  settings: Settings
): 'AVAILABLE' | 'RESERVED_FOR_ME' {
  const dow = getDayOfWeek(dateStr); // 0=Sun,3=Wed,5=Fri
  if (dow === 3 && settings.recurring_wed) return 'RESERVED_FOR_ME';
  if (dow === 5 && settings.recurring_fri) return 'RESERVED_FOR_ME';
  return 'AVAILABLE';
}

/**
 * Check whether a UTC time range is unobstructed by any explicit DB block
 * that is non-AVAILABLE, OR by the recurring default for any Stockholm day
 * that the range spans and has no explicit DB block.
 *
 * @param rangeStart  - Start of candidate booking (UTC)
 * @param rangeEnd    - End of candidate booking (UTC)
 * @param dbBlocks    - All explicitly stored schedule blocks (public view)
 * @param settings    - App settings (for recurring Wed/Fri rule)
 */
function isRangeFree(
  rangeStart: Date,
  rangeEnd: Date,
  dbBlocks: PublicBlock[],
  settings: Settings
): boolean {
  // 1. Check against explicit DB blocks
  const dbConflict = dbBlocks.some((b) => {
    if (b.status === 'AVAILABLE') return false;
    const bStart = new Date(b.starts_at);
    const bEnd = new Date(b.ends_at);
    return rangeStart < bEnd && rangeEnd > bStart;
  });
  if (dbConflict) return false;

  // 2. Check recurring default for every Stockholm calendar day the range touches.
  //    If a day has no explicit DB block covering it AND its default is RESERVED_FOR_ME,
  //    then any booking overlapping that day is blocked.
  const startDateStr = stockholmDateStr(rangeStart);
  const endDateStr   = stockholmDateStr(new Date(rangeEnd.getTime() - 1)); // -1ms: end is exclusive

  let cursor = rangeStart;
  while (true) {
    const dayStr = stockholmDateStr(cursor);

    // Does any explicit DB block cover this day? If so, it overrides the default.
    const dayMidnight = stockholmMidnight(dayStr);
    const nextMidnightMs = dayMidnight.getTime() + 24 * 3600 * 1000;
    const nextMidnight = new Date(nextMidnightMs);

    const hasDbBlockForDay = dbBlocks.some((b) => {
      const bStart = new Date(b.starts_at);
      const bEnd   = new Date(b.ends_at);
      // DB block overlaps this calendar day at all
      return bStart < nextMidnight && bEnd > dayMidnight;
    });

    if (!hasDbBlockForDay) {
      // No DB block → apply recurring default with custom start/end hours
      const dow = getDayOfWeek(dayStr);
      if (dow === 3 && settings.recurring_wed) {
        const startStr = settings.recurring_wed_start || '00:00';
        const endStr = settings.recurring_wed_end || '24:00';
        const recStart = localToUtc(dayStr, startStr, STOCKHOLM_TZ);
        const recEnd = localToUtc(dayStr, endStr, STOCKHOLM_TZ);
        if (rangeStart < recEnd && rangeEnd > recStart) {
          return false;
        }
      } else if (dow === 5 && settings.recurring_fri) {
        const startStr = settings.recurring_fri_start || '00:00';
        const endStr = settings.recurring_fri_end || '24:00';
        const recStart = localToUtc(dayStr, startStr, STOCKHOLM_TZ);
        const recEnd = localToUtc(dayStr, endStr, STOCKHOLM_TZ);
        if (rangeStart < recEnd && rangeEnd > recStart) {
          return false;
        }
      }
    }

    // Advance to next Stockholm day
    if (dayStr >= endDateStr) break;
    cursor = nextMidnight;
    if (cursor >= rangeEnd) break;
  }

  return true;
}

/**
 * Scan all 30-minute-increment start times within the clicked available segment
 * and return the **earliest valid** booking option for each duration (12h, 24h).
 *
 * A candidate start is valid only if:
 *  - The entire [start, start+duration] window is free (no reserved/reserved-for-me blocks)
 *  - [start, start+duration] ≤ booking cutoff
 *  - [start, start+duration] ≤ ticket validity
 *  - Both start and end times, in Asia/Kolkata, fall inside the awake window
 *
 * @param segmentStartUtc  Start of the clicked AVAILABLE segment (UTC)
 * @param segmentEndUtc    End of the clicked AVAILABLE segment (UTC)
 * @param dbBlocks         All fetched public schedule blocks
 * @param settings         App settings
 */
export function getBookingOptions(
  segmentStartUtc: Date,
  segmentEndUtc: Date,
  dbBlocks: PublicBlock[],
  settings: Settings
): BookingOption[] {
  const { awake_start, awake_end, admin_timezone, price_12h, price_24h,
          booking_cutoff, ticket_valid_until } = settings;

  const prices: Record<number, number> = { 12: price_12h, 24: price_24h };
  const cutoff     = new Date(booking_cutoff);
  const validUntil = new Date(ticket_valid_until);
  const now        = new Date();

  // Round 'now' up to the next 30-min boundary so we don't offer slots already started
  const nowRoundedUp = new Date(Math.ceil(now.getTime() / STEP_MS) * STEP_MS);

  // Effective search start: whichever is later — segment start or rounded-up now
  // Rounded to 30-min boundary
  const searchStartMs = Math.max(
    Math.ceil(segmentStartUtc.getTime() / STEP_MS) * STEP_MS,
    nowRoundedUp.getTime()
  );

  const result: BookingOption[] = [];

  for (const duration of DURATIONS) {
    const durationMs = duration * 3600 * 1000;
    let found: BookingOption | null = null;

    let candidateMs = searchStartMs;

    // The booking must end within the available segment AND within validity/cutoff
    const latestEnd = Math.min(
      segmentEndUtc.getTime(),
      cutoff.getTime(),
      validUntil.getTime()
    );

    while (candidateMs + durationMs <= latestEnd) {
      const candidateStart = new Date(candidateMs);
      const candidateEnd   = new Date(candidateMs + durationMs);

      // Check awake window for handover (start) and return (end)
      if (!isInAwakeWindow(candidateStart, awake_start, awake_end, admin_timezone)) {
        candidateMs += STEP_MS;
        continue;
      }
      if (!isInAwakeWindow(candidateEnd, awake_start, awake_end, admin_timezone)) {
        candidateMs += STEP_MS;
        continue;
      }

      // Check that the full range is free (no DB conflicts AND no default reserved days)
      if (!isRangeFree(candidateStart, candidateEnd, dbBlocks, settings)) {
        candidateMs += STEP_MS;
        continue;
      }

      // Valid!
      found = {
        duration,
        price: prices[duration],
        startsAt: candidateStart,
        endsAt: candidateEnd,
        valid: true,
      };
      break;
    }

    if (found) {
      result.push(found);
    } else {
      // No valid slot for this duration — include as invalid so the UI can explain why
      result.push({
        duration,
        price: prices[duration],
        startsAt: segmentStartUtc,
        endsAt: new Date(segmentStartUtc.getTime() + durationMs),
        valid: false,
        reason: 'No valid slot within this period (check awake window or conflicts)',
      });
    }
  }

  return result;
}

/**
 * Build a synthetic block for an entire calendar day if no explicit
 * DB blocks cover that day.
 */
export function buildDefaultDayBlock(
  dateStr: string,
  settings: Settings
): PublicBlock {
  const dayStart = stockholmMidnight(dateStr);
  const nextDateStr = stockholmDateStr(new Date(dayStart.getTime() + 25 * 3600 * 1000));
  const dayEnd = stockholmMidnight(nextDateStr);

  return {
    id: `default-${dateStr}`,
    starts_at: dayStart.toISOString(),
    ends_at: dayEnd.toISOString(),
    status: getDefaultStatus(dateStr, settings),
    created_at: new Date().toISOString(),
  };
}

/**
 * Check if there are any overlapping blocks in the DB for a candidate range.
 * Used server-side for conflict detection in the admin API.
 */
export function hasOverlap(
  startsAt: Date,
  endsAt: Date,
  existingBlocks: Array<{ starts_at: string; ends_at: string; id?: string }>,
  excludeId?: string
): boolean {
  return existingBlocks.some((b) => {
    if (excludeId && b.id === excludeId) return false;
    const bStart = new Date(b.starts_at);
    const bEnd = new Date(b.ends_at);
    return startsAt < bEnd && endsAt > bStart;
  });
}

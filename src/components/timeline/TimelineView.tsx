'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { PublicBlock, Settings } from '@/types';
import {
  getDateRange, stockholmDateStr, stockholmMidnight,
  STOCKHOLM_TZ, getDayOfWeek
} from '@/lib/timezone';
import { getDefaultStatus } from '@/lib/availability';
import DayTimeline from './DayTimeline';
import BookingModal from '../booking/BookingModal';

interface TimelineViewProps {
  settings: Settings;
}

/**
 * Given a click within a green segment, find the end of the CONTIGUOUS
 * available window starting from segmentStart.
 *
 * We walk forward day by day (up to 3 days ahead) and extend the window
 * as long as each successive day is also fully available (no
 * RESERVED/RESERVED_FOR_ME blocks and not a default-reserved day).
 *
 * This allows the 24h scanner to find valid start times that cross midnight.
 */
function computeContiguousEnd(
  segmentStart: Date,
  segmentEnd: Date,
  allBlocks: PublicBlock[],
  settings: Settings,
  cutoff: Date,
  validUntil: Date
): Date {
  // Hard caps
  const hardEnd = new Date(Math.min(cutoff.getTime(), validUntil.getTime()));

  // Start with the segment's own end
  let contigEnd = new Date(Math.min(segmentEnd.getTime(), hardEnd.getTime()));

  // Walk forward through subsequent Stockholm days (up to 3 extra days)
  for (let extra = 0; extra < 3; extra++) {
    const nextDayDateStr = stockholmDateStr(new Date(contigEnd.getTime() + 1));
    const nextDayMidnight = stockholmMidnight(nextDayDateStr);
    const nextDayEnd = new Date(nextDayMidnight.getTime() + 24 * 3600 * 1000);

    if (nextDayMidnight >= hardEnd) break;

    // Does this next day have any non-AVAILABLE DB block?
    const hasBlockedDbBlock = allBlocks.some((b) => {
      if (b.status === 'AVAILABLE') return false;
      const bStart = new Date(b.starts_at);
      const bEnd = new Date(b.ends_at);
      return bStart < nextDayEnd && bEnd > nextDayMidnight;
    });
    if (hasBlockedDbBlock) break;

    // Is the next day default RESERVED_FOR_ME (and has no DB override to AVAILABLE)?
    const defaultSt = getDefaultStatus(nextDayDateStr, settings);
    if (defaultSt === 'RESERVED_FOR_ME') {
      // Only blocked if there's no explicit AVAILABLE DB block covering that day
      const hasAvailableOverride = allBlocks.some((b) => {
        if (b.status !== 'AVAILABLE') return false;
        const bStart = new Date(b.starts_at);
        const bEnd = new Date(b.ends_at);
        return bStart < nextDayEnd && bEnd > nextDayMidnight;
      });
      if (!hasAvailableOverride) break;
    }

    // Next day is available — extend the window
    contigEnd = new Date(Math.min(nextDayEnd.getTime(), hardEnd.getTime()));
  }

  return contigEnd;
}

export default function TimelineView({ settings }: TimelineViewProps) {
  const [blocks, setBlocks] = useState<PublicBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<{ startsAt: Date; endsAt: Date } | null>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const hasFetched = useRef(false);

  const fetchBlocks = useCallback(async () => {
    try {
      const todayMidnight = stockholmMidnight(stockholmDateStr(new Date()));
      const from = todayMidnight.toISOString();
      const to = new Date(settings.ticket_valid_until).toISOString();
      const res = await fetch(`/api/availability?from=${from}&to=${to}`);
      if (res.ok) {
        const json = await res.json();
        setBlocks(json.blocks ?? []);
      }
    } catch (e) {
      console.error('Failed to load schedule:', e);
    } finally {
      setLoading(false);
    }
  }, [settings.ticket_valid_until]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('code=')) {
      window.location.href = `/auth/callback${window.location.search}&next=/admin`;
      return;
    }
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchBlocks();
    }
  }, [fetchBlocks]);

  useEffect(() => {
    if (!loading && todayRef.current) {
      // Allow layout to paint before scrolling to center
      const timer = setTimeout(() => {
        todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  const now = new Date();
  const today = stockholmDateStr(now);
  const start = today;
  const end = stockholmDateStr(new Date(settings.ticket_valid_until));
  const dateRange = getDateRange(stockholmMidnight(start), stockholmMidnight(end));
  const cutoff = new Date(settings.booking_cutoff);
  const validUntil = new Date(settings.ticket_valid_until);

  // Group dates by month for visual separation
  const grouped: { monthLabel: string; dates: string[] }[] = [];
  let currentMonth = '';
  for (const d of dateRange) {
    const [y, m] = d.split('-');
    const monthKey = `${y}-${m}`;
    const monthLabel = new Date(`${d}T12:00:00Z`).toLocaleDateString('en-SE', {
      month: 'long', year: 'numeric', timeZone: STOCKHOLM_TZ
    });
    if (monthKey !== currentMonth) {
      currentMonth = monthKey;
      grouped.push({ monthLabel, dates: [] });
    }
    grouped[grouped.length - 1].dates.push(d);
  }

  const handleSelectSlot = (segStart: Date, segEnd: Date) => {
    // Extend the available window forward through contiguous available days
    const contiguousEnd = computeContiguousEnd(
      segStart, segEnd, blocks, settings, cutoff, validUntil
    );
    setSelectedSlot({ startsAt: segStart, endsAt: contiguousEnd });
  };

  return (
    <>
      <div className="space-y-6">
        {loading && (
          <div className="space-y-3">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-neutral-100 p-4 shadow-sm">
                <div className="shimmer h-4 w-32 rounded mb-3"></div>
                <div className="shimmer h-10 w-full rounded-xl"></div>
              </div>
            ))}
          </div>
        )}

        {!loading && grouped.map(({ monthLabel, dates }) => (
          <div key={monthLabel}>
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 px-1">
              {monthLabel}
            </h3>
            <div className="space-y-2">
              {dates.map((dateStr) => {
                const isToday = dateStr === today;
                const isPast = dateStr < today;
                const dayMidnight = stockholmMidnight(dateStr);
                const afterCutoff = dayMidnight > cutoff;

                // Find DB blocks for this day (overlapping)
                const nextMidnight = new Date(dayMidnight.getTime() + 24 * 3600 * 1000);
                const dayBlocks = blocks.filter((b) => {
                  const bs = new Date(b.starts_at);
                  const be = new Date(b.ends_at);
                  return bs < nextMidnight && be > dayMidnight;
                });

                return (
                  <div
                    key={dateStr}
                    ref={isToday ? todayRef : undefined}
                    id={isToday ? 'today' : undefined}
                  >
                    <DayTimeline
                      dateStr={dateStr}
                      isToday={isToday}
                      isPast={isPast}
                      afterCutoff={afterCutoff}
                      blocks={dayBlocks}
                      allBlocks={blocks}
                      settings={settings}
                      onSelectSlot={handleSelectSlot}
                      defaultStatus={getDefaultStatus(dateStr, settings)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selectedSlot && (
        <BookingModal
          startsAt={selectedSlot.startsAt}
          endsAt={selectedSlot.endsAt}
          allBlocks={blocks}
          settings={settings}
          onClose={() => setSelectedSlot(null)}
        />
      )}
    </>
  );
}

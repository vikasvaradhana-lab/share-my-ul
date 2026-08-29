'use client';

import React, { useMemo } from 'react';
import type { PublicBlock, ScheduleBlock, Settings } from '@/types';
import { STOCKHOLM_TZ, stockholmMidnight, toStockholmTime } from '@/lib/timezone';

interface DayTimelineProps {
  dateStr: string;           // YYYY-MM-DD
  isToday: boolean;
  isPast: boolean;
  afterCutoff: boolean;
  blocks: PublicBlock[];     // blocks that overlap this day
  allBlocks: PublicBlock[];
  settings: Settings;
  defaultStatus: 'AVAILABLE' | 'RESERVED_FOR_ME';
  onSelectSlot: (startsAt: Date, endsAt: Date) => void;
}

interface Segment {
  startFrac: number;   // 0..1 fraction of the 24h day
  endFrac: number;
  status: 'AVAILABLE' | 'RESERVED_FOR_ME' | 'RESERVED' | 'PAST';
  label: string;
  startsAt: Date;
  endsAt: Date;
  clickable: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-green-400 hover:bg-green-500 cursor-pointer',
  RESERVED_FOR_ME: 'bg-pink-400',
  RESERVED: 'bg-red-400',
  PAST: 'bg-neutral-200 text-neutral-400',
  DEFAULT: '',
};

const STATUS_LABELS: Record<string, string> = {
  AVAILABLE: 'Available',
  RESERVED_FOR_ME: 'Reserved for me',
  RESERVED: 'Reserved',
  PAST: 'Past / Expired',
};

export default function DayTimeline({
  dateStr, isToday, isPast, afterCutoff, blocks, allBlocks, settings, defaultStatus, onSelectSlot
}: DayTimelineProps) {
  const dayMidnightUtc = stockholmMidnight(dateStr);
  const dayEndUtc = new Date(dayMidnightUtc.getTime() + 24 * 3600 * 1000);
  const now = new Date();

  // Day label
  const dayDate = new Date(`${dateStr}T12:00:00Z`);
  const dayLabel = dayDate.toLocaleDateString('en-SE', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: STOCKHOLM_TZ,
  });
  const dowFull = dayDate.toLocaleDateString('en-SE', { weekday: 'long', timeZone: STOCKHOLM_TZ });

  // Build segments for the timeline
  const segments = useMemo<Segment[]>(() => {
    const segs: Segment[] = [];
    const dayDuration = 24 * 3600 * 1000;

    const toFrac = (d: Date) =>
      Math.max(0, Math.min(1, (d.getTime() - dayMidnightUtc.getTime()) / dayDuration));

    const pushAvailableSpan = (segStart: Date, segEnd: Date) => {
      if (segStart >= segEnd) return;

      if (isPast || afterCutoff) {
        segs.push({
          startFrac: toFrac(segStart),
          endFrac: toFrac(segEnd),
          status: 'PAST',
          label: afterCutoff ? 'Not bookable' : 'Past',
          startsAt: segStart,
          endsAt: segEnd,
          clickable: false,
        });
        return;
      }

      if (isToday) {
        if (segEnd <= now) {
          // Entirely in the past earlier today -> grey
          segs.push({
            startFrac: toFrac(segStart),
            endFrac: toFrac(segEnd),
            status: 'PAST',
            label: 'Past',
            startsAt: segStart,
            endsAt: segEnd,
            clickable: false,
          });
        } else if (segStart < now && segEnd > now) {
          // Crosses current time: split elapsed part (grey) and future part (green)
          segs.push({
            startFrac: toFrac(segStart),
            endFrac: toFrac(now),
            status: 'PAST',
            label: 'Past',
            startsAt: segStart,
            endsAt: now,
            clickable: false,
          });
          segs.push({
            startFrac: toFrac(now),
            endFrac: toFrac(segEnd),
            status: 'AVAILABLE',
            label: 'Available',
            startsAt: now,
            endsAt: segEnd,
            clickable: true,
          });
        } else {
          // Remaining future part of today
          segs.push({
            startFrac: toFrac(segStart),
            endFrac: toFrac(segEnd),
            status: 'AVAILABLE',
            label: 'Available',
            startsAt: segStart,
            endsAt: segEnd,
            clickable: true,
          });
        }
      } else {
        // Future date
        segs.push({
          startFrac: toFrac(segStart),
          endFrac: toFrac(segEnd),
          status: 'AVAILABLE',
          label: 'Available',
          startsAt: segStart,
          endsAt: segEnd,
          clickable: true,
        });
      }
    };

    // If no explicit DB blocks on this day
    if (blocks.length === 0) {
      if (defaultStatus === 'AVAILABLE') {
        pushAvailableSpan(dayMidnightUtc, dayEndUtc);
      } else {
        // Recurring personal use (RESERVED_FOR_ME)
        segs.push({
          startFrac: 0,
          endFrac: 1,
          status: 'RESERVED_FOR_ME',
          label: 'Reserved for me',
          startsAt: dayMidnightUtc,
          endsAt: dayEndUtc,
          clickable: false,
        });
      }
      return segs.filter((s) => s.endFrac > s.startFrac);
    }

    // Sort blocks by start
    const sorted = [...blocks].sort((a, b) =>
      new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
    );

    let cursor = dayMidnightUtc;

    for (const block of sorted) {
      const bs = new Date(block.starts_at);
      const be = new Date(block.ends_at);
      const segStart = bs < dayMidnightUtc ? dayMidnightUtc : bs;
      const segEnd = be > dayEndUtc ? dayEndUtc : be;

      // Gap before this block
      if (cursor < segStart) {
        if (defaultStatus === 'AVAILABLE') {
          pushAvailableSpan(cursor, segStart);
        } else {
          segs.push({
            startFrac: toFrac(cursor),
            endFrac: toFrac(segStart),
            status: 'RESERVED_FOR_ME',
            label: 'Reserved for me',
            startsAt: cursor,
            endsAt: segStart,
            clickable: false,
          });
        }
      }

      // The block itself
      if (block.status === 'AVAILABLE') {
        pushAvailableSpan(segStart, segEnd);
      } else if (block.status === 'RESERVED_FOR_ME') {
        segs.push({
          startFrac: toFrac(segStart),
          endFrac: toFrac(segEnd),
          status: 'RESERVED_FOR_ME',
          label: 'Reserved for me',
          startsAt: segStart,
          endsAt: segEnd,
          clickable: false,
        });
      } else {
        // RESERVED
        segs.push({
          startFrac: toFrac(segStart),
          endFrac: toFrac(segEnd),
          status: 'RESERVED',
          label: 'Reserved',
          startsAt: segStart,
          endsAt: segEnd,
          clickable: false,
        });
      }

      cursor = segEnd > cursor ? segEnd : cursor;
    }

    // Trailing gap
    if (cursor < dayEndUtc) {
      if (defaultStatus === 'AVAILABLE') {
        pushAvailableSpan(cursor, dayEndUtc);
      } else {
        segs.push({
          startFrac: toFrac(cursor),
          endFrac: 1,
          status: 'RESERVED_FOR_ME',
          label: 'Reserved for me',
          startsAt: cursor,
          endsAt: dayEndUtc,
          clickable: false,
        });
      }
    }

    return segs.filter((s) => s.endFrac > s.startFrac);
  }, [blocks, dayMidnightUtc, dayEndUtc, isPast, defaultStatus, afterCutoff, now]);

  // Current time indicator (only shown for today)
  const nowFrac = isToday
    ? Math.max(0, Math.min(1, (now.getTime() - dayMidnightUtc.getTime()) / (24 * 3600 * 1000)))
    : null;

  const handleSegmentClick = (seg: Segment) => {
    if (!seg.clickable) return;
    onSelectSlot(seg.startsAt, seg.endsAt);
  };

  return (
    <div
      className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all duration-200 ${
        isToday ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-neutral-100'
      } ${afterCutoff ? 'opacity-60' : ''}`}
    >
      {/* Day header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${isToday ? 'text-indigo-600' : 'text-neutral-700'}`}>
            {isToday ? `Today · ${dayLabel}` : dayLabel}
          </span>
          {afterCutoff && (
            <span className="text-xs bg-neutral-100 text-neutral-400 px-2 py-0.5 rounded-full">
              Not bookable
            </span>
          )}
        </div>
        <span className="text-xs font-medium text-neutral-500">{dowFull}</span>
      </div>

      {/* 24-hour visual bar */}
      <div className="px-4 pb-3">
        <div className="relative h-8 rounded-xl overflow-hidden bg-neutral-100 flex">
          {segments.map((seg, idx) => {
            const widthPct = (seg.endFrac - seg.startFrac) * 100;
            const colorClass = STATUS_COLORS[seg.status] ?? 'bg-neutral-200';
            const isTiny = widthPct < 8;

            return (
              <div
                key={idx}
                style={{ width: `${widthPct}%` }}
                className={`h-full relative flex items-center justify-center transition-opacity ${colorClass} ${
                  seg.clickable ? 'hover:opacity-90 active:scale-[0.99]' : ''
                }`}
                title={`${seg.label}: ${toStockholmTime(seg.startsAt)} – ${toStockholmTime(seg.endsAt)}`}
                onClick={() => handleSegmentClick(seg)}
              >
                {!isTiny && (
                  <span className={`text-[11px] font-medium truncate px-1 select-none ${
                    seg.status === 'PAST' ? 'text-neutral-400' : 'text-white'
                  }`}>
                    {widthPct > 20
                      ? `${seg.label} (${toStockholmTime(seg.startsAt)}–${toStockholmTime(seg.endsAt)})`
                      : seg.label}
                  </span>
                )}
              </div>
            );
          })}

          {/* Current time marker (today only) */}
          {nowFrac !== null && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-indigo-600 z-10 pointer-events-none"
              style={{ left: `${nowFrac * 100}%` }}
            >
              <div className="w-2 h-2 rounded-full bg-indigo-600 -translate-x-[3px] -translate-y-0.5 now-dot" />
            </div>
          )}
        </div>

        {/* Time markers: 00:00, 06:00, 12:00, 18:00, 24:00 */}
        <div className="flex justify-between text-[11px] font-medium text-neutral-500 mt-1 px-0.5 select-none font-mono">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      </div>
    </div>
  );
}

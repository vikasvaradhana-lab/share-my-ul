'use client';

import React, { useState, useMemo } from 'react';
import type { ScheduleBlock, Settings } from '@/types';
import { STOCKHOLM_TZ, localToUtc, toStockholmTime, stockholmDateStr } from '@/lib/timezone';

interface PersonalBookingCalendarProps {
  blocks: ScheduleBlock[];
  settings?: Settings;
  onBlocksChange: () => Promise<void> | void;
}

export default function PersonalBookingCalendar({
  blocks,
  settings,
  onBlocksChange,
}: PersonalBookingCalendarProps) {
  const todayStr = stockholmDateStr(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Month navigation: default to current month
  const [viewYear, setViewYear] = useState<number>(() => {
    const d = new Date(`${todayStr}T12:00:00Z`);
    return d.getFullYear();
  });
  const [viewMonth, setViewMonth] = useState<number>(() => {
    const d = new Date(`${todayStr}T12:00:00Z`);
    return d.getMonth(); // 0-indexed
  });

  // Time form for selected date
  const [startTime, setStartTime] = useState<string>('08:30');
  const [endTime, setEndTime] = useState<string>('17:30');
  const [note, setNote] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Find existing personal block for selected date
  const existingBlock = useMemo(() => {
    return blocks.find((b) => {
      const bDate = stockholmDateStr(new Date(b.starts_at));
      return bDate === selectedDate && b.status === 'RESERVED_FOR_ME';
    });
  }, [blocks, selectedDate]);

  // When selectedDate changes, populate form if existing block exists
  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    setStatusMsg(null);
    const existing = blocks.find((b) => {
      const bDate = stockholmDateStr(new Date(b.starts_at));
      return bDate === dateStr && b.status === 'RESERVED_FOR_ME';
    });

    if (existing) {
      const s = toStockholmTime(new Date(existing.starts_at));
      const e = toStockholmTime(new Date(existing.ends_at));
      setStartTime(s === '24:00' ? '00:00' : s);
      setEndTime(e === '24:00' ? '23:59' : e);
      setNote(existing.private_note || '');
    } else {
      setStartTime('08:30');
      setEndTime('17:30');
      setNote('');
    }
  };

  // Month title
  const monthTitle = useMemo(() => {
    const d = new Date(Date.UTC(viewYear, viewMonth, 1));
    return d.toLocaleDateString('en-SE', {
      month: 'long',
      year: 'numeric',
      timeZone: STOCKHOLM_TZ,
    });
  }, [viewYear, viewMonth]);

  // Generate days in month grid (Monday-first)
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(Date.UTC(viewYear, viewMonth, 1));
    const lastDayOfMonth = new Date(Date.UTC(viewYear, viewMonth + 1, 0));
    const numDays = lastDayOfMonth.getDate();

    // 0=Sun, 1=Mon ... 6=Sat -> Convert to Monday=0 .. Sunday=6
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;

    const days: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      hasPersonal: boolean;
      personalTime?: string;
      hasReserved: boolean;
      isPast: boolean;
      isToday: boolean;
    }> = [];

    // Leading empty days
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({
        dateStr: '',
        dayNum: 0,
        isCurrentMonth: false,
        hasPersonal: false,
        hasReserved: false,
        isPast: false,
        isToday: false,
      });
    }

    // Days of current month
    for (let d = 1; d <= numDays; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      
      const dayBlocks = blocks.filter((b) => {
        const bDate = stockholmDateStr(new Date(b.starts_at));
        return bDate === dateStr;
      });

      const personal = dayBlocks.find((b) => b.status === 'RESERVED_FOR_ME');
      const reserved = dayBlocks.some((b) => b.status === 'RESERVED');

      let personalTime = '';
      if (personal) {
        const s = toStockholmTime(new Date(personal.starts_at));
        const e = toStockholmTime(new Date(personal.ends_at));
        personalTime = s === '00:00' && (e === '24:00' || e === '23:59') ? 'All Day' : `${s}-${e}`;
      }

      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        hasPersonal: !!personal,
        personalTime,
        hasReserved: reserved,
        isPast: dateStr < todayStr,
        isToday: dateStr === todayStr,
      });
    }

    return days;
  }, [viewYear, viewMonth, blocks, todayStr]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  // Save or update block
  const handleSaveBlock = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      const eTime = endTime === '23:59' || endTime === '00:00' ? '24:00' : endTime;
      const startsAtUtc = localToUtc(selectedDate, startTime, STOCKHOLM_TZ);
      const endsAtUtc = localToUtc(selectedDate, eTime, STOCKHOLM_TZ);

      if (endsAtUtc <= startsAtUtc) {
        setStatusMsg({ type: 'error', text: 'End time must be after start time' });
        setSaving(false);
        return;
      }

      if (existingBlock) {
        // Update
        const res = await fetch(`/api/admin/blocks?id=${existingBlock.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            starts_at: startsAtUtc.toISOString(),
            ends_at: endsAtUtc.toISOString(),
            status: 'RESERVED_FOR_ME',
            private_note: note || null,
          }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || 'Failed to update personal block');
        }
      } else {
        // Create new
        const res = await fetch('/api/admin/blocks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            starts_at: startsAtUtc.toISOString(),
            ends_at: endsAtUtc.toISOString(),
            status: 'RESERVED_FOR_ME',
            private_note: note || null,
          }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error || 'Failed to save personal block');
        }
      }

      setStatusMsg({ type: 'success', text: `Personal block saved for ${selectedDate}!` });
      await onBlocksChange();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Error saving block' });
    } finally {
      setSaving(false);
    }
  };

  // Delete block
  const handleDeleteBlock = async () => {
    if (!existingBlock) return;
    setSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch(`/api/admin/blocks?id=${existingBlock.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete block');
      setStatusMsg({ type: 'success', text: `Personal block removed for ${selectedDate}` });
      setStartTime('08:30');
      setEndTime('17:30');
      setNote('');
      await onBlocksChange();
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Error removing block' });
    } finally {
      setSaving(false);
    }
  };

  const selectedDateFormatted = useMemo(() => {
    if (!selectedDate) return '';
    const d = new Date(`${selectedDate}T12:00:00Z`);
    return d.toLocaleDateString('en-SE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: STOCKHOLM_TZ,
    });
  }, [selectedDate]);

  return (
    <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden space-y-4 p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5">
            <span>🩷</span> Personal Use Booking Calendar
          </h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            Click any date on the calendar to reserve personal hours. You can click and save as many dates as you need.
          </p>
        </div>
      </div>

      {/* Calendar Month Navigation */}
      <div className="border border-neutral-100 rounded-2xl p-4 bg-neutral-50/50">
        <div className="flex items-center justify-between mb-3 px-1">
          <button
            type="button"
            onClick={handlePrevMonth}
            className="w-8 h-8 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 flex items-center justify-center text-neutral-600 text-sm font-bold transition-colors"
            title="Previous Month"
          >
            ‹
          </button>
          <span className="text-sm font-bold text-neutral-800 capitalize">
            {monthTitle}
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            className="w-8 h-8 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 flex items-center justify-center text-neutral-600 text-sm font-bold transition-colors"
            title="Next Month"
          >
            ›
          </button>
        </div>

        {/* Days Header */}
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
          <span>Sun</span>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1.5">
          {calendarDays.map((day, idx) => {
            if (!day.isCurrentMonth) {
              return <div key={`empty-${idx}`} className="h-12 rounded-xl" />;
            }

            const isSelected = day.dateStr === selectedDate;

            return (
              <button
                key={day.dateStr}
                type="button"
                onClick={() => handleSelectDate(day.dateStr)}
                className={`h-13 rounded-xl p-1 flex flex-col items-center justify-between text-xs transition-all relative ${
                  isSelected
                    ? 'bg-neutral-900 text-white shadow-md scale-[1.03] z-10'
                    : day.hasPersonal
                    ? 'bg-pink-100/90 text-pink-900 border border-pink-300 font-semibold hover:bg-pink-200'
                    : day.isToday
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 font-medium hover:bg-indigo-100'
                    : 'bg-white border border-neutral-100 text-neutral-700 hover:border-neutral-300'
                }`}
              >
                <div className="flex items-center justify-between w-full px-1">
                  <span className={`text-[11px] ${day.isPast && !isSelected ? 'text-neutral-400' : ''}`}>
                    {day.dayNum}
                  </span>
                  {day.hasPersonal && (
                    <span className="text-[10px]" title="Reserved for me">🩷</span>
                  )}
                  {day.hasReserved && (
                    <span className="text-[10px]" title="Reserved by student">🔴</span>
                  )}
                </div>

                {day.hasPersonal && (
                  <span className={`text-[9px] truncate max-w-full px-1 rounded font-mono ${
                    isSelected ? 'text-pink-200' : 'text-pink-700'
                  }`}>
                    {day.personalTime}
                  </span>
                )}
                {!day.hasPersonal && day.isToday && (
                  <span className={`text-[9px] font-medium ${isSelected ? 'text-indigo-200' : 'text-indigo-600'}`}>
                    Today
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Date Time Config Box */}
      <div className="border border-neutral-200 rounded-2xl p-4 bg-white space-y-3.5 shadow-xs">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-pink-600">
              Selected Date
            </div>
            <div className="text-sm font-bold text-neutral-900">
              {selectedDateFormatted}
            </div>
          </div>
          {existingBlock ? (
            <span className="inline-flex items-center gap-1 bg-pink-100 text-pink-800 text-xs font-semibold px-2.5 py-1 rounded-full">
              🩷 Reserved for me
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs font-semibold px-2.5 py-1 rounded-full">
              🟢 Available
            </span>
          )}
        </div>

        {/* Quick Presets */}
        <div>
          <div className="text-xs font-semibold text-neutral-500 mb-1.5">Quick Presets:</div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setStartTime('00:00'); setEndTime('24:00'); }}
              className="text-xs px-3 py-1.5 rounded-xl border border-neutral-200 bg-neutral-50 hover:bg-pink-50 hover:border-pink-300 hover:text-pink-700 text-neutral-700 font-medium transition-colors"
            >
              All Day (00:00–24:00)
            </button>
            <button
              type="button"
              onClick={() => { setStartTime('08:30'); setEndTime('17:30'); }}
              className="text-xs px-3 py-1.5 rounded-xl border border-neutral-200 bg-neutral-50 hover:bg-pink-50 hover:border-pink-300 hover:text-pink-700 text-neutral-700 font-medium transition-colors"
            >
              Work Hours (08:30–17:30)
            </button>
            <button
              type="button"
              onClick={() => { setStartTime('12:00'); setEndTime('22:00'); }}
              className="text-xs px-3 py-1.5 rounded-xl border border-neutral-200 bg-neutral-50 hover:bg-pink-50 hover:border-pink-300 hover:text-pink-700 text-neutral-700 font-medium transition-colors"
            >
              Afternoon (12:00–22:00)
            </button>
          </div>
        </div>

        {/* Time Pickers */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              Start Time (Stockholm Time)
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-pink-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">
              End Time (Stockholm Time)
            </label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-pink-500 font-mono"
            />
          </div>
        </div>

        {/* Private Note */}
        <div>
          <label className="block text-xs font-medium text-neutral-700 mb-1">
            Private Note <span className="text-neutral-400 font-normal">(optional, visible only to you)</span>
          </label>
          <input
            type="text"
            placeholder="e.g. Office work, Uppsala trip, Personal errands"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-pink-500"
          />
        </div>

        {/* Status Message */}
        {statusMsg && (
          <div className={`p-3 rounded-xl text-xs font-medium ${
            statusMsg.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {statusMsg.type === 'success' ? '✓ ' : '⚠️ '}{statusMsg.text}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleSaveBlock}
            disabled={saving}
            className="flex-1 bg-pink-600 hover:bg-pink-700 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors disabled:opacity-50 shadow-sm"
          >
            {saving ? 'Saving…' : existingBlock ? '💾 Update Personal Block' : '💾 Save Personal Block for this Date'}
          </button>

          {existingBlock && (
            <button
              type="button"
              onClick={handleDeleteBlock}
              disabled={saving}
              className="bg-white border border-red-200 hover:bg-red-50 text-red-600 font-semibold py-2.5 px-4 rounded-xl text-sm transition-colors disabled:opacity-50"
            >
              🗑️ Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

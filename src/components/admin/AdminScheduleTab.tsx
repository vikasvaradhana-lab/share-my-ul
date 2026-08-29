'use client';

import React, { useState } from 'react';
import type { ScheduleBlock, Settings, BlockStatus } from '@/types';
import {
  toStockholmTime,
  STOCKHOLM_TZ,
  stockholmMidnight,
  stockholmDateStr,
  getDateRange,
  getDayOfWeek,
  localToUtc,
} from '@/lib/timezone';
import BlockEditorModal from './BlockEditorModal';
import ReservationModal from './ReservationModal';

interface AdminScheduleTabProps {
  blocks: ScheduleBlock[];
  settings: Settings;
  loading: boolean;
  onRefresh: () => void;
}

interface BlockItem {
  block: ScheduleBlock;
  isDefault: boolean;
}

const STATUS_LABELS: Record<BlockStatus, string> = {
  AVAILABLE: '🟢 Available',
  RESERVED_FOR_ME: '🩷 Reserved for me',
  RESERVED: '🔴 Reserved',
};

const STATUS_COLORS: Record<BlockStatus, string> = {
  AVAILABLE: 'bg-green-100 text-green-800 border-green-300 font-medium',
  RESERVED_FOR_ME: 'bg-pink-100 text-pink-800 border-pink-300 font-semibold shadow-xs',
  RESERVED: 'bg-red-100 text-red-800 border-red-300 font-semibold shadow-xs',
};

export default function AdminScheduleTab({ blocks, settings, loading, onRefresh }: AdminScheduleTabProps) {
  const todayStr = stockholmDateStr(new Date());
  const currentMonthKey = todayStr.substring(0, 7); // e.g. '2026-08'

  const [showEditor, setShowEditor] = useState(false);
  const [editBlock, setEditBlock] = useState<ScheduleBlock | null>(null);
  const [editorInitialStatus, setEditorInitialStatus] = useState<BlockStatus>('AVAILABLE');
  const [editorInitialDate, setEditorInitialDate] = useState<string | undefined>(undefined);
  const [editorInitialStartTime, setEditorInitialStartTime] = useState<string | undefined>(undefined);
  const [editorInitialEndTime, setEditorInitialEndTime] = useState<string | undefined>(undefined);
  const [showReservation, setShowReservation] = useState<ScheduleBlock | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Month filter ('all' or 'YYYY-MM')
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

  // Expanded months: only the current month is open by default
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => new Set([currentMonthKey]));

  // Expanded dates: only TODAY is expanded by default
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => new Set([todayStr]));

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) {
        next.delete(monthKey);
      } else {
        next.add(monthKey);
      }
      return next;
    });
  };

  const toggleDate = (dateStr: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) {
        next.delete(dateStr);
      } else {
        next.add(dateStr);
      }
      return next;
    });
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/blocks?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? 'Delete failed');
      } else {
        setConfirmDeleteId(null);
        onRefresh();
      }
    } catch {
      setError('Delete failed. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const openNewBlockModal = (
    status: BlockStatus = 'AVAILABLE',
    date?: string,
    startTime?: string,
    endTime?: string
  ) => {
    setEditBlock(null);
    setEditorInitialStatus(status);
    setEditorInitialDate(date);
    setEditorInitialStartTime(startTime);
    setEditorInitialEndTime(endTime);
    setShowEditor(true);
  };

  const handleEditEntry = (item: BlockItem, dateStr: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (item.isDefault) {
      openNewBlockModal(
        item.block.status,
        dateStr,
        toStockholmTime(new Date(item.block.starts_at)),
        toStockholmTime(new Date(item.block.ends_at))
      );
    } else {
      setEditBlock(item.block);
      setEditorInitialStatus(item.block.status);
      setEditorInitialDate(dateStr);
      setEditorInitialStartTime(undefined);
      setEditorInitialEndTime(undefined);
      setShowEditor(true);
    }
  };

  // 1. Group DB blocks by Stockholm date
  const blocksByDate = new Map<string, BlockItem[]>();
  for (const b of blocks) {
    const d = stockholmDateStr(new Date(b.starts_at));
    if (!blocksByDate.has(d)) blocksByDate.set(d, []);
    blocksByDate.get(d)!.push({ block: b, isDefault: false });
  }

  // 2. Synthesize recurring Wednesday & Friday default blocks for all upcoming dates
  const validUntilStr = stockholmDateStr(new Date(settings.ticket_valid_until));
  const allDateStrings = getDateRange(stockholmMidnight(todayStr), stockholmMidnight(validUntilStr));

  for (const d of allDateStrings) {
    const dow = getDayOfWeek(d); // 3 = Wed, 5 = Fri
    const isWed = dow === 3 && settings.recurring_wed;
    const isFri = dow === 5 && settings.recurring_fri;

    if ((isWed || isFri) && !blocksByDate.has(d)) {
      const startTime = isWed ? (settings.recurring_wed_start || '00:00') : (settings.recurring_fri_start || '00:00');
      const endTime = isWed ? (settings.recurring_wed_end || '24:00') : (settings.recurring_fri_end || '24:00');

      const startsAtUtc = localToUtc(d, startTime === '24:00' ? '00:00' : startTime, STOCKHOLM_TZ);
      let endsAtUtc = localToUtc(d, endTime === '24:00' ? '00:00' : endTime, STOCKHOLM_TZ);
      if (endTime === '24:00') {
        const nextDay = new Date(localToUtc(d, '00:00', STOCKHOLM_TZ));
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        endsAtUtc = nextDay;
      }

      const defaultBlock: ScheduleBlock = {
        id: `default-${d}`,
        starts_at: startsAtUtc.toISOString(),
        ends_at: endsAtUtc.toISOString(),
        status: 'RESERVED_FOR_ME',
        private_note: 'Recurring default',
        created_at: startsAtUtc.toISOString(),
        updated_at: startsAtUtc.toISOString(),
      };

      blocksByDate.set(d, [{ block: defaultBlock, isDefault: true }]);
    }
  }

  const sortedDates = Array.from(blocksByDate.keys()).sort();

  // Group sorted dates by month (e.g. '2026-08', '2026-09')
  const monthsMap = new Map<string, string[]>();
  for (const d of sortedDates) {
    const m = d.substring(0, 7);
    if (!monthsMap.has(m)) monthsMap.set(m, []);
    monthsMap.get(m)!.push(d);
  }

  const allMonths = Array.from(monthsMap.entries()).map(([mKey, mDates]) => {
    const labelDate = new Date(`${mDates[0]}T12:00:00Z`);
    const monthLabel = labelDate.toLocaleDateString('en-SE', {
      month: 'long', year: 'numeric', timeZone: STOCKHOLM_TZ,
    });
    return {
      monthKey: mKey,
      monthLabel,
      dates: mDates,
      isCurrentMonth: mKey === currentMonthKey,
    };
  });

  const visibleMonths = selectedMonth === 'all'
    ? allMonths
    : allMonths.filter(m => m.monthKey === selectedMonth);

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Schedule & Bookings</h2>
          <p className="text-xs text-neutral-400">Current day open · other dates wound up</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="reserve-for-me-btn"
            onClick={() => openNewBlockModal('RESERVED_FOR_ME')}
            className="flex items-center gap-1.5 bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 text-sm font-medium px-3.5 py-2 rounded-xl transition-colors shadow-sm"
          >
            <span>🩷</span>
            <span>Reserve for Me</span>
          </button>
          <button
            id="add-block-btn"
            onClick={() => openNewBlockModal('AVAILABLE')}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-3.5 py-2 rounded-xl transition-colors shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Add Block</span>
          </button>
        </div>
      </div>

      {/* Month Filter Tabs */}
      {allMonths.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            onClick={() => setSelectedMonth('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
              selectedMonth === 'all'
                ? 'bg-neutral-900 text-white shadow-sm'
                : 'bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-300'
            }`}
          >
            All Months
          </button>
          {allMonths.map((m) => (
            <button
              key={m.monthKey}
              onClick={() => setSelectedMonth(m.monthKey)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                selectedMonth === m.monthKey
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white border border-neutral-200 text-neutral-600 hover:border-neutral-300'
              }`}
            >
              {m.monthLabel}
              {m.isCurrentMonth && <span className="ml-1 opacity-75">· Now</span>}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">⚠️ {error}</div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-neutral-100 p-4 shimmer h-16" />
          ))}
        </div>
      ) : visibleMonths.length === 0 ? (
        <div className="bg-white rounded-2xl border border-neutral-100 p-10 text-center">
          <p className="text-neutral-600 text-sm font-medium">No bookings or blocks scheduled.</p>
          <p className="text-neutral-400 text-xs mt-1">Use the buttons above to set custom personal or available hours.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleMonths.map((m) => {
            const isMonthExpanded = selectedMonth === m.monthKey || expandedMonths.has(m.monthKey);

            return (
              <div key={m.monthKey} className="space-y-2">
                {/* Month Header */}
                <div
                  onClick={() => toggleMonth(m.monthKey)}
                  className="flex items-center justify-between px-2 py-1.5 cursor-pointer select-none group"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-neutral-400 group-hover:text-neutral-700 transition-transform duration-150 ${isMonthExpanded ? 'rotate-90 text-neutral-800' : ''}`}>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                    <h3 className="text-xs font-semibold text-neutral-600 uppercase tracking-wider group-hover:text-neutral-900 transition-colors">
                      {m.monthLabel}
                    </h3>
                    {m.isCurrentMonth && (
                      <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full border border-indigo-100">
                        Current
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-neutral-400">
                    {m.dates.length} {m.dates.length === 1 ? 'day' : 'days'}
                  </span>
                </div>

                {/* Month Dates */}
                {isMonthExpanded && (
                  <div className="space-y-2 pl-1 animate-in fade-in duration-150">
                    {m.dates.map((dateStr) => {
                      const dayItems = blocksByDate.get(dateStr)!;
                      const dayDate = new Date(`${dateStr}T12:00:00Z`);
                      const dayLabel = dayDate.toLocaleDateString('en-SE', {
                        weekday: 'short', day: 'numeric', month: 'short', timeZone: STOCKHOLM_TZ,
                      });
                      const fullDayLabel = dayDate.toLocaleDateString('en-SE', {
                        weekday: 'long', day: 'numeric', month: 'long', timeZone: STOCKHOLM_TZ,
                      });
                      const isToday = dateStr === todayStr;
                      const isExpanded = expandedDates.has(dateStr);

                      // Summary indicators
                      const hasReservedForMe = dayItems.some(i => i.block.status === 'RESERVED_FOR_ME');
                      const hasReserved = dayItems.some(i => i.block.status === 'RESERVED');
                      const hasAvailable = dayItems.some(i => i.block.status === 'AVAILABLE');

                      return (
                        <div
                          key={dateStr}
                          className={`bg-white rounded-2xl border transition-all duration-150 ${
                            isToday
                              ? 'border-indigo-300 ring-2 ring-indigo-50 shadow-sm'
                              : 'border-neutral-100 hover:border-neutral-200 shadow-sm'
                          } overflow-hidden`}
                        >
                          {/* Date Header Row */}
                          <div
                            onClick={() => toggleDate(dateStr)}
                            className="px-4 py-3 flex items-center justify-between gap-2 cursor-pointer select-none hover:bg-neutral-50/50 transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <div className={`text-neutral-400 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-indigo-600' : ''}`}>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                </svg>
                              </div>

                              <span className="text-sm font-semibold text-neutral-800">
                                {isExpanded ? fullDayLabel : dayLabel}
                              </span>

                              {isToday && (
                                <span className="text-[10px] uppercase font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                                  Today
                                </span>
                              )}

                              {!isExpanded && (
                                <div className="flex items-center gap-1.5 ml-1">
                                  {hasReservedForMe && (
                                    <span className="text-[11px] font-medium text-pink-700 bg-pink-50 border border-pink-100 px-2 py-0.5 rounded-full">
                                      🩷 For me
                                    </span>
                                  )}
                                  {hasReserved && (
                                    <span className="text-[11px] font-medium text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full">
                                      🔴 Reserved
                                    </span>
                                  )}
                                  {hasAvailable && (
                                    <span className="text-[11px] font-medium text-green-700 bg-green-50 border border-green-100 px-2 py-0.5 rounded-full">
                                      🟢 Available
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>

                            <div
                              className="flex items-center gap-1.5 flex-shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => openNewBlockModal('AVAILABLE', dateStr)}
                                className="text-[11px] text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg font-medium transition-colors"
                                title="Add custom block on this day"
                              >
                                + Block
                              </button>
                            </div>
                          </div>

                          {/* Expanded Details */}
                          {isExpanded && (
                            <div className="divide-y divide-neutral-50 border-t border-neutral-100 bg-neutral-50/20 animate-in fade-in duration-150">
                              {dayItems.map(({ block, isDefault }) => {
                                const isDeleting = deletingId === block.id;
                                const isConfirming = confirmDeleteId === block.id;

                                return (
                                  <div key={block.id} className="px-4 py-3 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0 flex-wrap">
                                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full border flex-shrink-0 ${STATUS_COLORS[block.status]}`}>
                                        {STATUS_LABELS[block.status]}
                                      </span>
                                      <span className="text-sm text-neutral-700 font-mono flex-shrink-0">
                                        {toStockholmTime(new Date(block.starts_at))} → {toStockholmTime(new Date(block.ends_at))}
                                      </span>
                                      {isDefault ? (
                                        <span className="text-[11px] text-pink-600/80 bg-pink-50/60 border border-pink-100 px-1.5 py-0.5 rounded font-medium">
                                          Recurring
                                        </span>
                                      ) : (
                                        <span className="text-[11px] text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded font-medium">
                                          Custom
                                        </span>
                                      )}
                                      {block.private_note && !isDefault && (
                                        <span className="text-xs text-neutral-400 truncate max-w-[140px]">{block.private_note}</span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      {block.status === 'AVAILABLE' && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setShowReservation(block); }}
                                          className="text-xs text-indigo-600 hover:text-indigo-800 border border-indigo-200 hover:border-indigo-400 px-2.5 py-1 rounded-lg transition-colors font-medium"
                                        >
                                          Mark Reserved
                                        </button>
                                      )}
                                      <button
                                        onClick={(e) => handleEditEntry({ block, isDefault }, dateStr, e)}
                                        className="text-xs text-neutral-600 hover:text-neutral-900 border border-neutral-200 hover:border-neutral-400 px-2.5 py-1 rounded-lg transition-colors font-medium"
                                      >
                                        {isDefault ? 'Edit / Customize' : 'Edit'}
                                      </button>
                                      {!isDefault && (
                                        isConfirming ? (
                                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                            <button
                                              onClick={(e) => handleDelete(block.id, e)}
                                              disabled={isDeleting}
                                              className="text-xs bg-red-600 hover:bg-red-700 text-white font-medium px-2 py-1 rounded-lg transition-colors"
                                            >
                                              {isDeleting ? 'Deleting…' : 'Sure?'}
                                            </button>
                                            <button
                                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                                              className="text-xs text-neutral-500 hover:text-neutral-700 border border-neutral-200 px-1.5 py-1 rounded-lg"
                                            >
                                              ✕
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(block.id); }}
                                            className="text-xs text-red-500 hover:text-red-700 border border-red-100 hover:border-red-200 hover:bg-red-50/50 px-2.5 py-1 rounded-lg transition-colors"
                                          >
                                            Delete
                                          </button>
                                        )
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showEditor && (
        <BlockEditorModal
          block={editBlock}
          initialStatus={editorInitialStatus}
          initialDate={editorInitialDate}
          initialStartTime={editorInitialStartTime}
          initialEndTime={editorInitialEndTime}
          settings={settings}
          onClose={() => setShowEditor(false)}
          onSaved={() => { setShowEditor(false); onRefresh(); }}
        />
      )}

      {showReservation && (
        <ReservationModal
          block={showReservation}
          settings={settings}
          onClose={() => setShowReservation(null)}
          onSaved={() => { setShowReservation(null); onRefresh(); }}
        />
      )}
    </div>
  );
}

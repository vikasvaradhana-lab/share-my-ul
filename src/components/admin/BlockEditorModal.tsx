'use client';

import React, { useState, useEffect, useMemo } from 'react';
import type { ScheduleBlock, Settings, BlockStatus } from '@/types';
import { stockholmDateStr, toStockholmTime, localToUtc, STOCKHOLM_TZ } from '@/lib/timezone';

interface BlockEditorModalProps {
  block: ScheduleBlock | null;  // null = new block
  initialStatus?: BlockStatus;
  initialDate?: string;
  initialStartTime?: string;
  initialEndTime?: string;
  settings: Settings;
  onClose: () => void;
  onSaved: () => void;
}

// Generate 30-minute time increments from 00:00 to 24:00
function generateTimeOptions(): string[] {
  const times: string[] = [];
  for (let h = 0; h <= 23; h++) {
    times.push(`${String(h).padStart(2, '0')}:00`);
    times.push(`${String(h).padStart(2, '0')}:30`);
  }
  times.push('24:00');
  return times;
}

const TIME_OPTIONS = generateTimeOptions();

const STATUS_OPTIONS: { value: BlockStatus; label: string }[] = [
  { value: 'AVAILABLE', label: '🟢 Available' },
  { value: 'RESERVED_FOR_ME', label: '🩷 Reserved for me' },
  { value: 'RESERVED', label: '🔴 Reserved' },
];

function calculateSlotPrice(durationHours: number, price12h: number, price24h: number): number {
  if (durationHours <= 0) return 0;
  if (durationHours <= 12) return price12h;
  if (durationHours <= 24) return price24h;

  const fullDays = Math.floor(durationHours / 24);
  const remHours = durationHours % 24;

  let remainderPrice = 0;
  if (remHours > 0) {
    if (remHours <= 12) {
      remainderPrice = price12h;
    } else {
      remainderPrice = price24h;
    }
  }
  return (fullDays * price24h) + remainderPrice;
}

export default function BlockEditorModal({
  block, initialStatus, initialDate, initialStartTime, initialEndTime, settings, onClose, onSaved
}: BlockEditorModalProps) {
  const isEdit = !!block && !block.id.startsWith('default-');

  // Initialise form
  const initDate = block
    ? stockholmDateStr(new Date(block.starts_at))
    : initialDate || stockholmDateStr(new Date());
  const initEndDate = block
    ? stockholmDateStr(new Date(block.ends_at))
    : initialDate || stockholmDateStr(new Date());
  const initStartTime = block
    ? toStockholmTime(new Date(block.starts_at))
    : initialStartTime || '06:30';
  const initEndTime = block
    ? toStockholmTime(new Date(block.ends_at))
    : initialEndTime || '18:30';

  const [date, setDate] = useState(initDate);
  const [endDate, setEndDate] = useState(initEndDate);
  const [startTime, setStartTime] = useState(initStartTime);
  const [endTime, setEndTime] = useState(initEndTime);
  const [status, setStatus] = useState<BlockStatus>(block?.status ?? initialStatus ?? 'AVAILABLE');
  const [note, setNote] = useState(block?.private_note && !block.id.startsWith('default-') ? block.private_note : '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasConflict, setHasConflict] = useState(false);

  // Price calculation state for RESERVED shares
  const [price, setPrice] = useState<number>(30);
  const [isManuallyEdited, setIsManuallyEdited] = useState(false);

  // Compute duration in hours
  const { durationHours, durationDisplay, autoPrice } = useMemo(() => {
    try {
      const sUtc = localToUtc(date, startTime === '24:00' ? '00:00' : startTime, STOCKHOLM_TZ);
      let eUtc = localToUtc(endDate, endTime === '24:00' ? '00:00' : endTime, STOCKHOLM_TZ);
      if (endTime === '24:00') {
        const nextDay = new Date(localToUtc(endDate, '00:00', STOCKHOLM_TZ));
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        eUtc = nextDay;
      }
      const diffMs = eUtc.getTime() - sUtc.getTime();
      const hours = Math.max(0, Math.round(diffMs / 3600000));
      const calcPrice = calculateSlotPrice(hours, settings.price_12h, settings.price_24h);

      let display = `${hours}h`;
      if (hours >= 24) {
        const days = (hours / 24).toFixed(hours % 24 === 0 ? 0 : 1);
        display = `${days} days (${hours}h)`;
      }

      return { durationHours: hours, durationDisplay: display, autoPrice: calcPrice };
    } catch {
      return { durationHours: 0, durationDisplay: '0h', autoPrice: 0 };
    }
  }, [date, endDate, startTime, endTime, settings.price_12h, settings.price_24h]);

  // Keep price synchronized with auto-calculation unless admin manually edited it
  useEffect(() => {
    if (!isManuallyEdited) {
      setPrice(autoPrice);
    }
  }, [autoPrice, isManuallyEdited]);

  const handleSave = async (overwrite = false) => {
    setSaving(true);
    setError(null);
    setHasConflict(false);
    try {
      const startsAtUtc = localToUtc(date, startTime === '24:00' ? '00:00' : startTime, STOCKHOLM_TZ);
      let endsAtUtc = localToUtc(endDate, endTime === '24:00' ? '00:00' : endTime, STOCKHOLM_TZ);

      if (endTime === '24:00') {
        const nextDay = new Date(localToUtc(endDate, '00:00', STOCKHOLM_TZ));
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        endsAtUtc = nextDay;
      }

      if (endsAtUtc <= startsAtUtc) {
        setError('End time must be after start time.');
        setSaving(false);
        return;
      }

      const body = {
        id: isEdit ? block?.id : undefined,
        starts_at: startsAtUtc.toISOString(),
        ends_at: endsAtUtc.toISOString(),
        status,
        private_note: note || null,
        overwrite,
        price_sek: status === 'RESERVED' ? Number(price) : undefined,
      };

      const res = await fetch('/api/admin/blocks', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Save failed');
        if (json.hasConflict || res.status === 409) {
          setHasConflict(true);
        }
      } else {
        onSaved();
      }
    } catch {
      setError('Unexpected error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!block || !isEdit) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/blocks?id=${block.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? 'Delete failed');
      } else {
        onSaved();
      }
    } catch {
      setError('Failed to delete block.');
    } finally {
      setDeleting(false);
    }
  };

  const validUntil = stockholmDateStr(new Date(settings.ticket_valid_until));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="px-6 pt-5 pb-6 space-y-4 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-neutral-900">
              {isEdit ? 'Edit Custom Block' : 'Add Block / Override'}
            </h2>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 p-1">
              ✕
            </button>
          </div>

          {/* Status radio buttons */}
          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">
              Status
            </label>
            <div className="grid grid-cols-3 gap-2">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={`py-2.5 px-2 rounded-xl text-xs font-medium border text-center transition-all ${
                    status === opt.value
                      ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-semibold shadow-xs'
                      : 'border-neutral-200 hover:border-neutral-300 text-neutral-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Start date & time */}
          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">
              Start (Stockholm time)
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={date}
                max={validUntil}
                onChange={(e) => {
                  setDate(e.target.value);
                  if (endDate < e.target.value) setEndDate(e.target.value);
                }}
                className="flex-1 border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              />
              <select
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              >
                {TIME_OPTIONS.filter((t) => t !== '24:00').map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* End date & time */}
          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">
              End (Stockholm time)
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={endDate}
                min={date}
                max={validUntil}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1 border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              />
              <select
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-neutral-400 mt-1">Use 24:00 for full day or cross-midnight periods.</p>
          </div>

          {/* Autocalculated & Editable Price for RESERVED shares */}
          {status === 'RESERVED' && (
            <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-200/80 space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-neutral-800">
                  Share Amount / Revenue
                </label>
                <span className="text-xs font-mono font-medium text-neutral-600 bg-white px-2.5 py-0.5 rounded-md border border-neutral-200 shadow-2xs">
                  ⏱️ {durationDisplay}
                </span>
              </div>

              <div className="flex rounded-xl border border-neutral-200 overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 bg-white">
                <input
                  type="number"
                  min="0"
                  value={price}
                  onChange={(e) => {
                    setPrice(Number(e.target.value));
                    setIsManuallyEdited(true);
                  }}
                  className="w-full px-3.5 py-2 text-sm focus:outline-none font-bold text-green-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="inline-flex items-center px-3.5 text-xs text-neutral-500 font-bold bg-neutral-100/80 border-l border-neutral-200 select-none">
                  SEK
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] pt-0.5">
                <span className="text-neutral-500">
                  {isManuallyEdited ? '✏️ Manually customized' : '⚡ Autocalculated from duration'}
                </span>
                {isManuallyEdited && (
                  <button
                    type="button"
                    onClick={() => {
                      setPrice(autoPrice);
                      setIsManuallyEdited(false);
                    }}
                    className="text-indigo-600 hover:text-indigo-700 font-medium underline"
                  >
                    Reset to auto ({autoPrice} SEK)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Private note */}
          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">
              Private Note (optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Personal trip, Axel paid 25 SEK"
              className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
            />
          </div>

          {/* Conflict/error warning */}
          {error && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-900 space-y-2">
              <div className="font-semibold flex items-center gap-1.5">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
              {hasConflict && (
                <div className="pt-1">
                  <p className="text-xs text-amber-700 mb-2">
                    Earlier blocks exist inside this date span. Would you like to replace them with this new block?
                  </p>
                  <button
                    type="button"
                    onClick={() => handleSave(true)}
                    disabled={saving}
                    className="w-full bg-amber-600 hover:bg-amber-700 text-white font-semibold py-2.5 px-4 rounded-xl text-xs transition-colors shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <span>🔄</span>
                    <span>{saving ? 'Replacing…' : 'Replace Overlapping Blocks & Save'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 border border-neutral-200 text-neutral-600 hover:bg-neutral-50 py-3 rounded-2xl text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSave(false)}
                disabled={saving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-2xl text-sm font-semibold transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Block'}
              </button>
            </div>

            {/* In-Modal Delete Option for Existing Blocks */}
            {isEdit && (
              <div className="pt-2 border-t border-neutral-100 flex justify-center">
                {confirmDelete ? (
                  <div className="flex items-center gap-2 w-full">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                      {deleting ? 'Deleting…' : 'Confirm Delete Block'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="px-3 py-2 border border-neutral-200 text-neutral-600 hover:bg-neutral-50 rounded-xl text-xs font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="text-xs text-red-500 hover:text-red-700 font-medium py-1 px-3 transition-colors"
                  >
                    🗑️ Delete this block
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

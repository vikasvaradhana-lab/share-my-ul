'use client';

import React, { useState } from 'react';
import type { ScheduleBlock, Settings } from '@/types';
import { toStockholmTime, formatDateStockholm } from '@/lib/timezone';

interface ReservationModalProps {
  block: ScheduleBlock;
  settings: Settings;
  onClose: () => void;
  onSaved: () => void;
}

export default function ReservationModal({ block, settings, onClose, onSaved }: ReservationModalProps) {
  const [duration, setDuration] = useState<12 | 24>(12);
  const [studentId, setStudentId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blockStart = new Date(block.starts_at);
  const blockEnd = new Date(block.ends_at);
  const blockDurationHours = (blockEnd.getTime() - blockStart.getTime()) / 3600000;

  const endsAt = new Date(blockStart.getTime() + duration * 3600000);
  const price = duration === 12 ? settings.price_12h : settings.price_24h;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          block_id: block.id,
          starts_at: block.starts_at,
          ends_at: endsAt.toISOString(),
          duration_hours: duration,
          price_sek: price,
          student_identifier: studentId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Failed to save');
      } else {
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 modal-backdrop bg-black/30"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-neutral-200 rounded-full"></div>
        </div>
        <div className="px-6 pt-2 pb-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900">Mark as Reserved</h2>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="bg-neutral-50 rounded-2xl p-4 text-sm">
            <div className="text-neutral-500">Block: {formatDateStockholm(blockStart)}</div>
            <div className="font-medium text-neutral-900 mt-1">
              {toStockholmTime(blockStart)} → {toStockholmTime(blockEnd)}
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">
              Duration
            </label>
            <div className="flex gap-2">
              {([12, 24] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  disabled={blockDurationHours < d}
                  className={`flex-1 text-sm font-medium py-2.5 px-4 rounded-xl border transition-all ${
                    duration === d
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                      : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {d}h · {d === 12 ? settings.price_12h : settings.price_24h} SEK
                </button>
              ))}
            </div>
            <p className="text-xs text-neutral-400 mt-1.5">
              Ends at: <strong>{toStockholmTime(endsAt)}</strong> · Price: <strong>{price} SEK</strong>
            </p>
          </div>

          {/* Student identifier */}
          <div>
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">
              Student (private, optional)
            </label>
            <input
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="e.g. Axel, or WhatsApp name"
              className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
            />
            <p className="text-xs text-neutral-400 mt-1">Never shown publicly.</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">⚠️ {error}</div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 border border-neutral-200 text-neutral-600 py-3 rounded-2xl text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-2xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : '🔴 Mark Reserved'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

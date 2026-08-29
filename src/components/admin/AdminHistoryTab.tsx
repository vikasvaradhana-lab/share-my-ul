'use client';

import React, { useState } from 'react';
import type { Reservation, Settings } from '@/types';
import { formatDateStockholm, toStockholmTime } from '@/lib/timezone';

interface AdminHistoryTabProps {
  reservations: Reservation[];
  settings: Settings;
  onRefresh: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  COMPLETED: 'bg-neutral-100 text-neutral-500 border-neutral-200',
  CANCELLED: 'bg-red-50 text-red-400 border-red-100',
};

export default function AdminHistoryTab({ reservations, settings, onRefresh }: AdminHistoryTabProps) {
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const total = reservations.length;
  const h12 = reservations.filter(r => r.duration_hours === 12).length;
  const h24 = reservations.filter(r => r.duration_hours === 24).length;
  const totalHours = reservations.reduce((sum, r) => sum + r.duration_hours, 0);
  const totalSek = reservations
    .filter(r => r.status === 'COMPLETED')
    .reduce((sum, r) => sum + r.price_sek, 0);

  const handleComplete = async (id: string) => {
    setUpdating(id);
    setError(null);
    try {
      const res = await fetch('/api/admin/reservations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'COMPLETED' }),
      });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? 'Update failed');
      } else {
        onRefresh();
      }
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="space-y-5">
      <h2 className="text-base font-semibold text-neutral-900">Sharing History</h2>

      {/* Stats summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-4 text-center">
          <div className="text-3xl font-bold text-indigo-600">{total}</div>
          <div className="text-xs text-neutral-500 mt-1">Total shares</div>
          <div className="text-xs text-neutral-400 mt-0.5">{h12} × 12h · {h24} × 24h</div>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-4 text-center">
          <div className="text-3xl font-bold text-indigo-600">{totalHours}h</div>
          <div className="text-xs text-neutral-500 mt-1">Total shared</div>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-4 text-center col-span-2">
          <div className="text-3xl font-bold text-green-600">{totalSek} SEK</div>
          <div className="text-xs text-neutral-500 mt-1">Received (completed shares)</div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">⚠️ {error}</div>
      )}

      {/* Reservations list */}
      {reservations.length === 0 ? (
        <div className="bg-white rounded-2xl border border-neutral-100 p-10 text-center">
          <p className="text-neutral-400 text-sm">No reservations yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {reservations.map((r) => {
            const start = new Date(r.starts_at);
            const end = new Date(r.ends_at);
            const isPast = end < new Date();
            return (
              <div key={r.id} className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-neutral-900">
                      {formatDateStockholm(start)}
                    </div>
                    <div className="text-sm text-neutral-600 font-mono mt-0.5">
                      {toStockholmTime(start)} → {toStockholmTime(end)}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs font-medium text-neutral-600">
                        {r.duration_hours}h · {r.price_sek} SEK
                      </span>
                      {r.student_identifier && (
                        <span className="text-xs text-neutral-400">· {r.student_identifier}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${STATUS_COLORS[r.status] ?? ''}`}>
                      {r.status}
                    </span>
                    {r.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleComplete(r.id)}
                        disabled={updating === r.id}
                        className="text-xs bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {updating === r.id ? '…' : 'Mark Completed'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

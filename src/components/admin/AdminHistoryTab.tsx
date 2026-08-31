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
  COMPLETED: 'bg-neutral-100 text-neutral-600 border-neutral-200',
  CANCELLED: 'bg-red-50 text-red-500 border-red-200',
};

export default function AdminHistoryTab({ reservations, settings, onRefresh }: AdminHistoryTabProps) {
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Edit state for a specific reservation
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editNote, setEditNote] = useState<string>('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'COMPLETED' | 'CANCELLED'>('COMPLETED');
  const [savingEdit, setSavingEdit] = useState(false);

  const total = reservations.length;
  const h12 = reservations.filter(r => r.duration_hours <= 12).length;
  const h24 = reservations.filter(r => r.duration_hours > 12).length;
  const totalHours = reservations.reduce((sum, r) => sum + r.duration_hours, 0);
  const totalSek = reservations
    .filter(r => r.status !== 'CANCELLED')
    .reduce((sum, r) => sum + (Number(r.price_sek) || 0), 0);

  const handleStartEdit = (r: Reservation) => {
    setEditingId(r.id);
    setEditPrice(r.price_sek);
    setEditNote(r.student_identifier || '');
    setEditStatus(r.status);
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async (id: string) => {
    setSavingEdit(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/reservations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          price_sek: Number(editPrice),
          student_identifier: editNote,
          status: editStatus,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? 'Failed to update reservation');
      } else {
        setEditingId(null);
        onRefresh();
      }
    } catch {
      setError('Failed to update. Please try again.');
    } finally {
      setSavingEdit(false);
    }
  };

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

  const [refreshing, setRefreshing] = useState(false);

  const handleRefreshClick = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setRefreshing(false), 500);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Sharing & Bookings History</h2>
          <p className="text-xs text-neutral-400">Manage confirmed shares and custom received amounts</p>
        </div>
        <button
          type="button"
          onClick={handleRefreshClick}
          disabled={refreshing}
          className="text-xs bg-white border border-neutral-200 hover:border-neutral-300 text-neutral-600 px-3 py-1.5 rounded-xl font-medium transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-60"
        >
          <span className={`inline-block text-sm ${refreshing ? 'animate-spin' : ''}`}>↻</span>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-4 text-center">
          <div className="text-3xl font-bold text-indigo-600">{total}</div>
          <div className="text-xs text-neutral-500 mt-1">Total shares</div>
          <div className="text-xs text-neutral-400 mt-0.5">{h12} × 12h · {h24} × 24h</div>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-4 text-center">
          <div className="text-3xl font-bold text-indigo-600">{totalHours}h</div>
          <div className="text-xs text-neutral-500 mt-1">Total hours shared</div>
        </div>
        <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-4 text-center">
          <div className="text-3xl font-bold text-green-600">{totalSek} SEK</div>
          <div className="text-xs text-neutral-500 mt-1">Total revenue received</div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">⚠️ {error}</div>
      )}

      {/* Reservations list */}
      {reservations.length === 0 ? (
        <div className="bg-white rounded-2xl border border-neutral-100 p-10 text-center">
          <p className="text-neutral-400 text-sm">No reservations recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reservations.map((r) => {
            const start = new Date(r.starts_at);
            const end = new Date(r.ends_at);
            const isEditing = editingId === r.id;

            return (
              <div key={r.id} className="bg-white rounded-2xl border border-neutral-100 shadow-sm p-4 transition-all">
                {!isEditing ? (
                  /* Standard Row Display */
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-neutral-900">
                        {formatDateStockholm(start)}
                      </div>
                      <div className="text-sm text-neutral-600 font-mono mt-0.5">
                        {toStockholmTime(start)} → {toStockholmTime(end)}
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="text-xs font-semibold text-neutral-800 bg-neutral-100 px-2 py-0.5 rounded-md">
                          {r.duration_hours}h
                        </span>
                        <span className="text-xs font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-md">
                          {r.price_sek} SEK
                        </span>
                        {r.student_identifier && (
                          <span className="text-xs text-neutral-600 font-medium">
                            · {r.student_identifier}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${STATUS_COLORS[r.status] ?? ''}`}>
                          {r.status}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(r)}
                          className="text-xs text-neutral-500 hover:text-indigo-600 border border-neutral-200 hover:border-indigo-200 bg-neutral-50 hover:bg-indigo-50 px-2 py-0.5 rounded-lg transition-colors font-medium flex items-center gap-1"
                        >
                          ✏️ Edit
                        </button>
                      </div>

                      {r.status === 'ACTIVE' && (
                        <button
                          onClick={() => handleComplete(r.id)}
                          disabled={updating === r.id}
                          className="text-xs bg-green-600 hover:bg-green-700 text-white font-medium px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 shadow-xs"
                        >
                          {updating === r.id ? '…' : '✓ Complete'}
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Inline Edit Form */
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                        Edit Share Details · {formatDateStockholm(start)}
                      </span>
                      <span className="text-xs font-mono text-neutral-400">
                        {toStockholmTime(start)} → {toStockholmTime(end)} ({r.duration_hours}h)
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Price input */}
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 mb-1">
                          Amount Received (SEK)
                        </label>
                        <div className="flex rounded-xl border border-neutral-200 overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 bg-white">
                          <input
                            type="number"
                            min="0"
                            value={editPrice}
                            onChange={(e) => setEditPrice(Number(e.target.value))}
                            className="w-full px-3 py-2 text-sm focus:outline-none font-semibold text-green-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <span className="inline-flex items-center px-3 text-xs text-neutral-500 font-semibold bg-neutral-50 border-l border-neutral-200 select-none">
                            SEK
                          </span>
                        </div>
                        <p className="text-[10px] text-neutral-400 mt-1">Set to 0 if waived</p>
                      </div>

                      {/* Student / Note input */}
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 mb-1">
                          Student Name / Note
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Rahul (Waived 10 SEK)"
                          value={editNote}
                          onChange={(e) => setEditNote(e.target.value)}
                          className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      {/* Status Selector */}
                      <div>
                        <label className="block text-xs font-medium text-neutral-700 mb-1">
                          Status
                        </label>
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value as any)}
                          className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 bg-white"
                        >
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="COMPLETED">COMPLETED</option>
                          <option value="CANCELLED">CANCELLED</option>
                        </select>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={savingEdit}
                        className="text-xs px-3 py-1.5 rounded-xl border border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-600 font-medium transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(r.id)}
                        disabled={savingEdit}
                        className="text-xs px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-colors disabled:opacity-50 shadow-xs"
                      >
                        {savingEdit ? 'Saving…' : '💾 Save Amount & Note'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

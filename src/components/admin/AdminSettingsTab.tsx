'use client';

import React, { useState } from 'react';
import type { Settings, ScheduleBlock } from '@/types';
import { STOCKHOLM_TZ } from '@/lib/timezone';
import PersonalBookingCalendar from './PersonalBookingCalendar';

interface AdminSettingsTabProps {
  settings: Settings;
  blocks?: ScheduleBlock[];
  onUpdate: (s: Settings) => void;
  onRefreshBlocks?: () => Promise<void> | void;
}

export default function AdminSettingsTab({
  settings,
  blocks = [],
  onUpdate,
  onRefreshBlocks = () => {},
}: AdminSettingsTabProps) {
  const [form, setForm] = useState({
    ticket_valid_until: toLocalDatetime(new Date(settings.ticket_valid_until)),
    booking_cutoff: toLocalDatetime(new Date(settings.booking_cutoff)),
    awake_start: settings.awake_start,
    awake_end: settings.awake_end,
    price_12h: settings.price_12h,
    price_24h: settings.price_24h,
    recurring_wed: settings.recurring_wed,
    recurring_wed_start: settings.recurring_wed_start || '00:00',
    recurring_wed_end: settings.recurring_wed_end || '24:00',
    recurring_fri: settings.recurring_fri,
    recurring_fri_start: settings.recurring_fri_start || '00:00',
    recurring_fri_end: settings.recurring_fri_end || '24:00',
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toLocalDatetime(d: Date): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: STOCKHOLM_TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
  }

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_valid_until: new Date(form.ticket_valid_until).toISOString(),
          booking_cutoff: new Date(form.booking_cutoff).toISOString(),
          awake_start: form.awake_start,
          awake_end: form.awake_end,
          price_12h: Number(form.price_12h),
          price_24h: Number(form.price_24h),
          recurring_wed: form.recurring_wed,
          recurring_wed_start: form.recurring_wed_start,
          recurring_wed_end: form.recurring_wed_end,
          recurring_fri: form.recurring_fri,
          recurring_fri_start: form.recurring_fri_start,
          recurring_fri_end: form.recurring_fri_end,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Save failed');
      } else {
        onUpdate(json.settings);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-50">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );

  const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <div>
      <label className="block text-xs font-medium text-neutral-700 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-neutral-400 mt-1">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-neutral-900">General Settings</h2>
        <p className="text-xs text-neutral-400">Configure ticket validity, prices, and awake handover hours</p>
      </div>

      {/* Ticket Validity */}
      <Section title="Ticket Validity & Cutoff">
        <Field label="Ticket valid until" hint="Times in Stockholm timezone">
          <input
            type="datetime-local"
            value={form.ticket_valid_until}
            onChange={(e) => setForm({ ...form, ticket_valid_until: e.target.value })}
            className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
          />
        </Field>
        <Field label="Booking cutoff" hint="Dates after this remain visible but not bookable">
          <input
            type="datetime-local"
            value={form.booking_cutoff}
            onChange={(e) => setForm({ ...form, booking_cutoff: e.target.value })}
            className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
          />
        </Field>
      </Section>

      {/* Admin availability */}
      <Section title="Admin Handover Awake Hours (India time, Asia/Kolkata)">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Awake from">
            <input
              type="time"
              value={form.awake_start}
              onChange={(e) => setForm({ ...form, awake_start: e.target.value })}
              className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-mono"
            />
          </Field>
          <Field label="Awake until">
            <input
              type="time"
              value={form.awake_end}
              onChange={(e) => setForm({ ...form, awake_end: e.target.value })}
              className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400 font-mono"
            />
          </Field>
        </div>
        <p className="text-xs text-neutral-400">
          Handover and return must both fall within your awake window for a student booking to be permitted. Cross-midnight hours (e.g. 06:30 to 01:30) are supported.
        </p>
      </Section>

      {/* Pricing */}
      <Section title="Pricing Configuration">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="12-hour price (SEK)">
            <input
              type="number"
              min={0}
              value={form.price_12h}
              onChange={(e) => setForm({ ...form, price_12h: parseInt(e.target.value) || 0 })}
              className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
            />
          </Field>
          <Field label="24-hour price (SEK)">
            <input
              type="number"
              min={0}
              value={form.price_24h}
              onChange={(e) => setForm({ ...form, price_24h: parseInt(e.target.value) || 0 })}
              className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
            />
          </Field>
        </div>
      </Section>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">⚠️ {error}</div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700">✓ Settings saved successfully.</div>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-2xl text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
      >
        {saving ? 'Saving…' : 'Save General Settings'}
      </button>

      {/* Visual Calendar for Personal Use Bookings (Moved to bottom) */}
      <div className="pt-4 border-t border-neutral-200">
        <PersonalBookingCalendar
          blocks={blocks}
          settings={settings}
          onBlocksChange={onRefreshBlocks}
        />
      </div>
    </div>
  );
}

'use client';

import React, { useState } from 'react';
import type { Settings } from '@/types';
import { STOCKHOLM_TZ } from '@/lib/timezone';

interface AdminSettingsTabProps {
  settings: Settings;
  onUpdate: (s: Settings) => void;
}

export default function AdminSettingsTab({ settings, onUpdate }: AdminSettingsTabProps) {
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
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );

  const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
    <div>
      <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5 block">{label}</label>
      {children}
      {hint && <p className="text-xs text-neutral-400 mt-1">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-neutral-900">Settings</h2>

      {/* Ticket */}
      <Section title="Ticket">
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
      <Section title="Admin availability (India time, Asia/Kolkata)">
        <div className="flex gap-3">
          <Field label="Awake from">
            <input
              type="time"
              value={form.awake_start}
              onChange={(e) => setForm({ ...form, awake_start: e.target.value })}
              className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
            />
          </Field>
          <Field label="Awake until">
            <input
              type="time"
              value={form.awake_end}
              onChange={(e) => setForm({ ...form, awake_end: e.target.value })}
              className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-400"
            />
          </Field>
        </div>
        <p className="text-xs text-neutral-400">
          Handover and return must both fall within this window for a booking to be offered.
        </p>
      </Section>

      {/* Recurring defaults */}
      <Section title="Recurring personal use (🩷 Reserved for me)">
        <div className="space-y-5">
          {/* Wednesdays */}
          <div className="border border-neutral-100 rounded-2xl p-4 bg-neutral-50/50 space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <div className="text-sm font-medium text-neutral-800">Every Wednesday</div>
                <div className="text-xs text-neutral-400">Default recurring personal use</div>
              </div>
              <div className="relative ml-4">
                <input
                  type="checkbox"
                  checked={form.recurring_wed}
                  onChange={(e) => setForm({ ...form, recurring_wed: e.target.checked })}
                  className="sr-only peer"
                  id="recurring-wed"
                />
                <label
                  htmlFor="recurring-wed"
                  className="block w-11 h-6 bg-neutral-200 rounded-full cursor-pointer peer-checked:bg-pink-500 transition-colors relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:w-5 after:h-5 after:transition-transform peer-checked:after:translate-x-5"
                ></label>
              </div>
            </label>

            {form.recurring_wed && (
              <div className="pt-2 border-t border-neutral-100">
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
                  Reserved Time Range (Stockholm time)
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    type="time"
                    value={form.recurring_wed_start === '24:00' ? '00:00' : form.recurring_wed_start}
                    onChange={(e) => setForm({ ...form, recurring_wed_start: e.target.value })}
                    className="flex-1 border border-neutral-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-pink-400"
                  />
                  <span className="text-xs text-neutral-400">to</span>
                  <input
                    type="time"
                    value={form.recurring_wed_end === '24:00' ? '23:59' : form.recurring_wed_end}
                    onChange={(e) => setForm({ ...form, recurring_wed_end: e.target.value })}
                    className="flex-1 border border-neutral-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-pink-400"
                  />
                </div>
                <div className="flex gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, recurring_wed_start: '00:00', recurring_wed_end: '24:00' })}
                    className="text-[11px] text-pink-700 bg-pink-50 hover:bg-pink-100 px-2 py-0.5 rounded-md font-medium"
                  >
                    All Day (24h)
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, recurring_wed_start: '08:30', recurring_wed_end: '17:30' })}
                    className="text-[11px] text-neutral-600 bg-white border border-neutral-200 hover:bg-neutral-50 px-2 py-0.5 rounded-md font-medium"
                  >
                    Daytime (08:30–17:30)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Fridays */}
          <div className="border border-neutral-100 rounded-2xl p-4 bg-neutral-50/50 space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <div className="text-sm font-medium text-neutral-800">Every Friday</div>
                <div className="text-xs text-neutral-400">Default recurring personal use</div>
              </div>
              <div className="relative ml-4">
                <input
                  type="checkbox"
                  checked={form.recurring_fri}
                  onChange={(e) => setForm({ ...form, recurring_fri: e.target.checked })}
                  className="sr-only peer"
                  id="recurring-fri"
                />
                <label
                  htmlFor="recurring-fri"
                  className="block w-11 h-6 bg-neutral-200 rounded-full cursor-pointer peer-checked:bg-pink-500 transition-colors relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:w-5 after:h-5 after:transition-transform peer-checked:after:translate-x-5"
                ></label>
              </div>
            </label>

            {form.recurring_fri && (
              <div className="pt-2 border-t border-neutral-100">
                <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
                  Reserved Time Range (Stockholm time)
                </div>
                <div className="flex gap-2 items-center">
                  <input
                    type="time"
                    value={form.recurring_fri_start === '24:00' ? '00:00' : form.recurring_fri_start}
                    onChange={(e) => setForm({ ...form, recurring_fri_start: e.target.value })}
                    className="flex-1 border border-neutral-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-pink-400"
                  />
                  <span className="text-xs text-neutral-400">to</span>
                  <input
                    type="time"
                    value={form.recurring_fri_end === '24:00' ? '23:59' : form.recurring_fri_end}
                    onChange={(e) => setForm({ ...form, recurring_fri_end: e.target.value })}
                    className="flex-1 border border-neutral-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:border-pink-400"
                  />
                </div>
                <div className="flex gap-1.5 mt-2">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, recurring_fri_start: '00:00', recurring_fri_end: '24:00' })}
                    className="text-[11px] text-pink-700 bg-pink-50 hover:bg-pink-100 px-2 py-0.5 rounded-md font-medium"
                  >
                    All Day (24h)
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, recurring_fri_start: '12:00', recurring_fri_end: '22:00' })}
                    className="text-[11px] text-neutral-600 bg-white border border-neutral-200 hover:bg-neutral-50 px-2 py-0.5 rounded-md font-medium"
                  >
                    Afternoon (12:00–22:00)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Pricing */}
      <Section title="Pricing">
        <div className="flex gap-3">
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
        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-2xl text-sm font-semibold transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save Settings'}
      </button>
    </div>
  );
}

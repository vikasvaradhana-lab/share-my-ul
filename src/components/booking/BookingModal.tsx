'use client';

import React, { useEffect, useMemo, useState } from 'react';
import type { PublicBlock, Settings } from '@/types';
import { isInAwakeWindow, toStockholmTime, formatDateStockholm, stockholmDateStr, stockholmMidnight } from '@/lib/timezone';
import { getDefaultStatus } from '@/lib/availability';

interface BookingModalProps {
  startsAt: Date;   // start of the clicked AVAILABLE segment
  endsAt: Date;     // end of the contiguous available window
  allBlocks: PublicBlock[];
  settings: Settings;
  onClose: () => void;
}

const STEP_MS = 30 * 60 * 1000;

/**
 * Check that the full [start, end) range is free of any reserved block
 * (both explicit DB blocks and recurring Wed/Fri defaults).
 */
function isRangeFree(
  rangeStart: Date,
  rangeEnd: Date,
  dbBlocks: PublicBlock[],
  settings: Settings
): boolean {
  // Check explicit DB blocks
  const dbConflict = dbBlocks.some((b) => {
    if (b.status === 'AVAILABLE') return false;
    const bStart = new Date(b.starts_at);
    const bEnd = new Date(b.ends_at);
    return rangeStart < bEnd && rangeEnd > bStart;
  });
  if (dbConflict) return false;

  // Check recurring defaults for each Stockholm day touched
  const endDateStr = stockholmDateStr(new Date(rangeEnd.getTime() - 1));
  let cursor = rangeStart;
  while (true) {
    const dayStr = stockholmDateStr(cursor);
    const dayMidnight = stockholmMidnight(dayStr);
    const nextMidnight = new Date(dayMidnight.getTime() + 24 * 3600 * 1000);

    const hasDbForDay = dbBlocks.some((b) => {
      const bStart = new Date(b.starts_at);
      const bEnd = new Date(b.ends_at);
      return bStart < nextMidnight && bEnd > dayMidnight;
    });

    if (!hasDbForDay && getDefaultStatus(dayStr, settings) === 'RESERVED_FOR_ME') {
      return false;
    }

    if (dayStr >= endDateStr) break;
    cursor = nextMidnight;
    if (cursor >= rangeEnd) break;
  }

  return true;
}

/**
 * Build the list of all valid 30-min start times for a given duration
 * within the contiguous available window.
 */
function buildValidStarts(
  segStart: Date,
  contigEnd: Date,
  duration: 12 | 24,
  dbBlocks: PublicBlock[],
  settings: Settings
): Date[] {
  const { awake_start, awake_end, admin_timezone, booking_cutoff, ticket_valid_until } = settings;
  const cutoff     = new Date(booking_cutoff);
  const validUntil = new Date(ticket_valid_until);
  const now        = new Date();

  const durationMs = duration * 3600 * 1000;
  const nowRoundedUp = new Date(Math.ceil(now.getTime() / STEP_MS) * STEP_MS);

  // Earliest candidate: segment start or now, rounded to 30 min
  const searchStartMs = Math.max(
    Math.ceil(segStart.getTime() / STEP_MS) * STEP_MS,
    nowRoundedUp.getTime()
  );

  const latestEnd = Math.min(contigEnd.getTime(), cutoff.getTime(), validUntil.getTime());

  const results: Date[] = [];
  let ms = searchStartMs;

  while (ms + durationMs <= latestEnd) {
    const cs = new Date(ms);
    const ce = new Date(ms + durationMs);

    if (
      isInAwakeWindow(cs, awake_start, awake_end, admin_timezone) &&
      isInAwakeWindow(ce, awake_start, awake_end, admin_timezone) &&
      isRangeFree(cs, ce, dbBlocks, settings)
    ) {
      results.push(cs);
    }
    ms += STEP_MS;
  }

  return results;
}

export default function BookingModal({
  startsAt, endsAt, allBlocks, settings, onClose
}: BookingModalProps) {
  const [duration, setDuration] = useState<12 | 24>(24);
  const [sliderIndex, setSliderIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [whatsappLink, setWhatsappLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Build valid start arrays for both durations
  const validStarts24 = useMemo(
    () => buildValidStarts(startsAt, endsAt, 24, allBlocks, settings),
    [startsAt, endsAt, allBlocks, settings]
  );
  const validStarts12 = useMemo(
    () => buildValidStarts(startsAt, endsAt, 12, allBlocks, settings),
    [startsAt, endsAt, allBlocks, settings]
  );

  // Pick default duration: prefer 24h if it has valid slots
  useEffect(() => {
    if (validStarts24.length > 0) {
      setDuration(24);
    } else if (validStarts12.length > 0) {
      setDuration(12);
    }
    setSliderIndex(0);
    setWhatsappLink(null);
    setError(null);
  }, [validStarts24.length, validStarts12.length]);

  // Reset slider to 0 when duration changes
  const handleDurationChange = (d: 12 | 24) => {
    setDuration(d);
    setSliderIndex(0);
    setWhatsappLink(null);
    setError(null);
  };

  const validStarts = duration === 24 ? validStarts24 : validStarts12;
  const hasAnyValid = validStarts.length > 0;
  const has24h = validStarts24.length > 0;
  const has12h = validStarts12.length > 0;

  // Clamp slider index
  const clampedIndex = Math.min(sliderIndex, Math.max(0, validStarts.length - 1));
  const selectedStart = hasAnyValid ? validStarts[clampedIndex] : null;
  const selectedEnd = selectedStart
    ? new Date(selectedStart.getTime() + duration * 3600 * 1000)
    : null;

  const price = duration === 24 ? settings.price_24h : settings.price_12h;

  const handleRequest = async () => {
    if (!selectedStart || !selectedEnd) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startsAt: selectedStart.toISOString(),
          endsAt: selectedEnd.toISOString(),
          duration,
          price,
        }),
      });
      if (!res.ok) throw new Error('Failed to generate link');
      const { link } = await res.json();
      setWhatsappLink(link);
    } catch {
      setError('Could not generate WhatsApp link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Close helpers
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Display helpers
  const dateDisplay = formatDateStockholm(startsAt);

  // Slider labels: first and last valid start times
  const sliderMin = hasAnyValid ? validStarts[0] : null;
  const sliderMax = hasAnyValid ? validStarts[validStarts.length - 1] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 modal-backdrop bg-black/30"
      onClick={handleBackdrop}
    >
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-neutral-200 rounded-full"></div>
        </div>

        <div className="px-6 pt-2 pb-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">Request a share</h2>
              <p className="text-sm text-neutral-500 mt-0.5">{dateDisplay}</p>
            </div>
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-600 transition-colors p-1 -mr-1 -mt-1"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {whatsappLink && selectedStart && selectedEnd ? (
            /* WhatsApp link ready state */
            <div className="space-y-4">
              <div className="bg-green-50 rounded-2xl p-4 space-y-1.5">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                    <path d="M11.99 2C6.476 2 2 6.476 2 11.99c0 1.832.492 3.548 1.35 5.029L2 22l5.114-1.324A9.93 9.93 0 0 0 11.99 22c5.514 0 9.99-4.476 9.99-9.99S17.504 2 11.99 2z" />
                  </svg>
                  <span className="text-sm font-semibold text-green-800">Ready to send!</span>
                </div>
                <div className="text-sm text-green-800 font-medium">
                  {toStockholmTime(selectedStart)} → {toStockholmTime(selectedEnd)}
                </div>
                <div className="text-xs text-green-700">{duration} hours · {price} SEK</div>
              </div>
              <p className="text-xs text-neutral-500 text-center leading-relaxed">
                Tap below to send your Ticket Share request directly on WhatsApp.
              </p>
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  try {
                    fetch('/api/track', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ type: 'whatsapp_click', page: '/' }),
                    }).catch(() => {});
                  } catch {}
                }}
                className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold py-3.5 px-6 rounded-2xl transition-colors text-sm"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                  <path d="M11.99 2C6.476 2 2 6.476 2 11.99c0 1.832.492 3.548 1.35 5.029L2 22l5.114-1.324A9.93 9.93 0 0 0 11.99 22c5.514 0 9.99-4.476 9.99-9.99S17.504 2 11.99 2z" />
                </svg>
                Open WhatsApp to Request
              </a>
              <button
                onClick={() => { setWhatsappLink(null); }}
                className="w-full text-sm text-neutral-400 hover:text-neutral-600 py-2 transition-colors"
              >
                ← Change time
              </button>
            </div>
          ) : !hasAnyValid && !has12h && !has24h ? (
            /* No valid slots at all */
            <div className="text-center py-8">
              <div className="text-3xl mb-3">🌙</div>
              <p className="text-sm font-medium text-neutral-700">No slots available in this period</p>
              <p className="text-xs text-neutral-400 mt-2 leading-relaxed">
                This window doesn't fit within available handover hours.
              </p>
            </div>
          ) : (
            /* Slider + duration toggle */
            <>
              {/* Duration toggle */}
              <div>
                <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 block">
                  Duration
                </label>
                <div className="flex gap-2">
                  {([24, 12] as const).map((d) => {
                    const available = d === 24 ? has24h : has12h;
                    return (
                      <button
                        key={d}
                        onClick={() => available && handleDurationChange(d)}
                        disabled={!available}
                        className={`flex-1 relative py-3 px-4 rounded-2xl border text-sm font-semibold transition-all ${
                          duration === d && available
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                            : available
                            ? 'bg-white border-neutral-200 text-neutral-700 hover:border-indigo-300'
                            : 'bg-neutral-50 border-neutral-100 text-neutral-300 cursor-not-allowed'
                        }`}
                      >
                        <span>{d}h</span>
                        <span className={`ml-1.5 text-xs font-normal ${
                          duration === d && available ? 'text-indigo-200' : 'text-neutral-400'
                        }`}>
                          {d === 24 ? settings.price_24h : settings.price_12h} SEK
                        </span>
                        {!available && (
                          <span className="absolute -top-1.5 -right-1 text-[9px] bg-neutral-200 text-neutral-400 px-1 rounded-full">
                            N/A
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Start time slider */}
              {hasAnyValid && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                      Start time <span className="text-neutral-400 font-normal normal-case">(Stockholm)</span>
                    </label>
                    {validStarts.length === 1 && (
                      <span className="text-xs text-neutral-400">only one slot</span>
                    )}
                  </div>

                  {/* Slider */}
                  <div className="relative">
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, validStarts.length - 1)}
                      value={clampedIndex}
                      onChange={(e) => setSliderIndex(parseInt(e.target.value))}
                      className="w-full h-2 appearance-none bg-neutral-200 rounded-full outline-none cursor-pointer"
                      style={{
                        background: validStarts.length > 1
                          ? `linear-gradient(to right, #4f46e5 0%, #4f46e5 ${(clampedIndex / Math.max(1, validStarts.length - 1)) * 100}%, #e5e7eb ${(clampedIndex / Math.max(1, validStarts.length - 1)) * 100}%, #e5e7eb 100%)`
                          : '#4f46e5',
                      }}
                      disabled={validStarts.length <= 1}
                      id="start-time-slider"
                    />
                    {/* Min/max labels */}
                    {sliderMin && sliderMax && validStarts.length > 1 && (
                      <div className="flex justify-between mt-1">
                        <span className="text-[11px] text-neutral-400">{toStockholmTime(sliderMin)}</span>
                        <span className="text-[11px] text-neutral-400">{toStockholmTime(sliderMax)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Live booking preview */}
              {hasAnyValid && selectedStart && selectedEnd && (
                <div className="bg-indigo-50 rounded-2xl p-4">
                  <div className="text-xs text-indigo-500 font-semibold uppercase tracking-wider mb-2">
                    Your booking
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-bold text-indigo-900 leading-tight">
                        {toStockholmTime(selectedStart)}
                        <span className="text-indigo-400 font-normal mx-1.5">→</span>
                        {toStockholmTime(selectedEnd)}
                      </div>
                      <div className="text-xs text-indigo-600 mt-0.5">
                        {formatDateStockholm(selectedStart)}
                        {/* Show "→ next day" for cross-midnight bookings */}
                        {stockholmDateStr(selectedStart) !== stockholmDateStr(new Date(selectedEnd.getTime() - 1)) && (
                          <span className="ml-1 text-indigo-400">→ {formatDateStockholm(selectedEnd)}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-indigo-700">{price}</div>
                      <div className="text-xs text-indigo-500">SEK</div>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  ⚠️ {error}
                </div>
              )}

              {/* Action buttons */}
              <div>
                <button
                  onClick={handleRequest}
                  disabled={!hasAnyValid || loading}
                  className="w-full flex items-center justify-center gap-2.5 bg-green-500 hover:bg-green-600 disabled:bg-neutral-200 disabled:text-neutral-400 text-white font-semibold py-3.5 px-6 rounded-2xl transition-colors text-sm"
                  id="request-whatsapp-btn"
                >
                  {loading ? (
                    'Generating…'
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                        <path d="M11.99 2C6.476 2 2 6.476 2 11.99c0 1.832.492 3.548 1.35 5.029L2 22l5.114-1.324A9.93 9.93 0 0 0 11.99 22c5.514 0 9.99-4.476 9.99-9.99S17.504 2 11.99 2z" />
                      </svg>
                      Request via WhatsApp
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Slider thumb styles */}
      <style jsx>{`
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: white;
          border: 2.5px solid #4f46e5;
          box-shadow: 0 1px 4px rgba(79,70,229,0.25);
          cursor: pointer;
          transition: box-shadow 0.15s;
        }
        input[type='range']::-webkit-slider-thumb:hover {
          box-shadow: 0 0 0 6px rgba(79,70,229,0.12);
        }
        input[type='range']::-moz-range-thumb {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: white;
          border: 2.5px solid #4f46e5;
          box-shadow: 0 1px 4px rgba(79,70,229,0.25);
          cursor: pointer;
        }
        input[type='range']:disabled::-webkit-slider-thumb {
          border-color: #a5b4fc;
          cursor: default;
        }
      `}</style>
    </div>
  );
}

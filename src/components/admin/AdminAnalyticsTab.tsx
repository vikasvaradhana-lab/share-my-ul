'use client';

import React, { useState, useEffect } from 'react';
import { toStockholmTime, STOCKHOLM_TZ } from '@/lib/timezone';

interface AnalyticsData {
  totalViews: number;
  todayViews: number;
  whatsappClicks: number;
  recentLogs: Array<{
    id: string;
    visited_at: string;
    event_type: string;
    referrer: string;
  }>;
}

export default function AdminAnalyticsTab() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/analytics');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error('Failed to load analytics:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-neutral-900">Website Traffic & Activity</h2>
          <p className="text-xs text-neutral-400">Real-time visitor counts and link activity</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAnalytics}
            disabled={loading}
            className="text-xs bg-white border border-neutral-200 hover:border-neutral-300 text-neutral-600 px-3 py-1.5 rounded-xl font-medium transition-colors shadow-xs"
          >
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
          <a
            href="https://vercel.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs bg-black hover:bg-neutral-800 text-white px-3 py-1.5 rounded-xl font-medium transition-colors shadow-xs flex items-center gap-1.5"
          >
            ▲ Vercel Analytics →
          </a>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-neutral-100 p-4 shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Link Visits</span>
            <span className="text-base">👁️</span>
          </div>
          <div className="text-2xl font-bold text-neutral-900">
            {loading ? '…' : data?.totalViews ?? 0}
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">Total page views recorded</p>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-100 p-4 shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Today's Visits</span>
            <span className="text-base">📅</span>
          </div>
          <div className="text-2xl font-bold text-indigo-600">
            {loading ? '…' : data?.todayViews ?? 0}
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">Active visitors today</p>
        </div>

        <div className="bg-white rounded-2xl border border-neutral-100 p-4 shadow-sm">
          <div className="flex items-center justify-between text-neutral-400 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">WhatsApp Clicks</span>
            <span className="text-base">💬</span>
          </div>
          <div className="text-2xl font-bold text-green-600">
            {loading ? '…' : data?.whatsappClicks ?? 0}
          </div>
          <p className="text-[11px] text-neutral-400 mt-1">Tapped "Request on WhatsApp"</p>
        </div>
      </div>

      {/* Detailed Insights & Vercel Promo */}
      <div className="bg-gradient-to-r from-indigo-50/70 to-purple-50/70 border border-indigo-100 rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-indigo-950">Vercel Web Analytics is Active</h3>
          <p className="text-xs text-indigo-700/80 mt-0.5 max-w-md">
            Detailed breakdowns of unique devices, countries, browsers, and referrers (e.g. WhatsApp vs Direct) are available in your Vercel project dashboard.
          </p>
        </div>
        <a
          href="https://vercel.com/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl transition-colors shadow-sm"
        >
          View Full Breakdown
        </a>
      </div>

      {/* Activity Log */}
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-800">Recent Activity Log</h3>
          <span className="text-xs text-neutral-400">Last 15 events</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-400">Loading visit logs…</div>
        ) : !data?.recentLogs || data.recentLogs.length === 0 ? (
          <div className="p-8 text-center text-xs text-neutral-400">
            No visitor logs recorded yet. Visit the public page to see live activity appear here!
          </div>
        ) : (
          <div className="divide-y divide-neutral-50">
            {data.recentLogs.map((log, idx) => {
              const logDate = new Date(log.visited_at);
              const formattedTime = logDate.toLocaleTimeString('en-SE', {
                hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: STOCKHOLM_TZ,
              });
              const formattedDate = logDate.toLocaleDateString('en-SE', {
                month: 'short', day: 'numeric', timeZone: STOCKHOLM_TZ,
              });

              const isWhatsApp = log.event_type === 'whatsapp_click';

              return (
                <div key={log.id || idx} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`px-2 py-0.5 rounded-full font-medium ${
                      isWhatsApp
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                    }`}>
                      {isWhatsApp ? '💬 WhatsApp Click' : '👁️ Page View'}
                    </span>
                    <span className="text-neutral-600 truncate">
                      {log.referrer || 'Direct Link'}
                    </span>
                  </div>
                  <span className="text-neutral-400 font-mono text-[11px] flex-shrink-0">
                    {formattedDate} {formattedTime}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

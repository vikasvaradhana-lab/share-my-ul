'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { Settings, ScheduleBlock, Reservation } from '@/types';
import { createBrowserSupabase } from '@/lib/supabase-browser';
import { stockholmMidnight, stockholmDateStr } from '@/lib/timezone';
import AdminScheduleTab from './AdminScheduleTab';
import AdminSettingsTab from './AdminSettingsTab';
import AdminHistoryTab from './AdminHistoryTab';
import AdminAnalyticsTab from './AdminAnalyticsTab';

type Tab = 'schedule' | 'analytics' | 'settings' | 'history';

interface AdminDashboardProps {
  user: { email: string; id: string };
  initialSettings: Settings;
}

export default function AdminDashboard({ user, initialSettings }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('schedule');
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(true);

  const fetchBlocks = useCallback(async () => {
    setLoadingBlocks(true);
    try {
      const todayMidnight = stockholmMidnight(stockholmDateStr(new Date()));
      const res = await fetch('/api/admin/blocks?from=' + todayMidnight.toISOString());
      if (res.ok) {
        const json = await res.json();
        setBlocks(json.blocks ?? []);
      }
    } finally {
      setLoadingBlocks(false);
    }
  }, []);

  const fetchReservations = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/reservations?t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const json = await res.json();
        setReservations(json.reservations ?? []);
      }
    } catch (e) {
      console.error('Failed to fetch reservations:', e);
    }
  }, []);

  useEffect(() => {
    fetchBlocks();
    fetchReservations();
  }, [fetchBlocks, fetchReservations]);

  const handleLogout = async () => {
    const supabase = createBrowserSupabase();
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'schedule', label: 'Schedule', icon: '📅' },
    { id: 'analytics', label: 'Visits & Traffic', icon: '📊' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
    { id: 'history', label: 'Bookings', icon: '🎟️' },
  ];

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-100 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
              UL
            </div>
            <div>
              <div className="text-sm font-semibold text-neutral-900">Share My UL Admin</div>
              <div className="text-xs text-neutral-400">{user.email}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a href="/" className="text-xs text-neutral-500 hover:text-neutral-700 transition-colors">
              View site →
            </a>
            <button
              onClick={handleLogout}
              className="text-xs text-neutral-500 hover:text-red-500 transition-colors px-3 py-1.5 border border-neutral-200 rounded-lg hover:border-red-200"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Tab nav */}
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto scrollbar-none">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-600 font-semibold'
                    : 'border-transparent text-neutral-500 hover:text-neutral-700'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {activeTab === 'schedule' && (
          <AdminScheduleTab
            blocks={blocks}
            settings={settings}
            loading={loadingBlocks}
            onRefresh={fetchBlocks}
          />
        )}
        {activeTab === 'analytics' && (
          <AdminAnalyticsTab />
        )}
        {activeTab === 'settings' && (
          <AdminSettingsTab
            settings={settings}
            blocks={blocks}
            onUpdate={(s) => setSettings(s)}
            onRefreshBlocks={fetchBlocks}
          />
        )}
        {activeTab === 'history' && (
          <AdminHistoryTab
            reservations={reservations}
            settings={settings}
            onRefresh={fetchReservations}
          />
        )}
      </div>
    </main>
  );
}

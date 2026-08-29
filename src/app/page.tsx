import { createServerSupabase } from '@/lib/supabase-server';
import type { Settings } from '@/types';
import TimelineView from '@/components/timeline/TimelineView';

async function getSettings(): Promise<Settings | null> {
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase.from('settings').select('*').eq('id', 1).single();
    return data as Settings | null;
  } catch {
    return null;
  }
}

// Default settings for when Supabase is not yet configured
const DEFAULT_SETTINGS: Settings = {
  id: 1,
  ticket_valid_until: '2026-09-30T21:59:00Z',
  booking_cutoff: '2026-09-27T21:59:00Z',
  admin_timezone: 'Asia/Kolkata',
  awake_start: '06:30',
  awake_end: '22:30',
  price_12h: 25,
  price_24h: 30,
  recurring_wed: true,
  recurring_fri: true,
  updated_at: new Date().toISOString(),
};

export default async function HomePage() {
  const settings = await getSettings() ?? DEFAULT_SETTINGS;

  return (
    <main className="min-h-screen bg-neutral-50" suppressHydrationWarning>
      {/* Header */}
      <header className="bg-white border-b border-neutral-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            UL
          </div>
          <div>
            <h1 className="text-lg font-semibold text-neutral-900 leading-tight">Share My UL — Discounted Ticket</h1>
            <p className="text-xs text-neutral-500 leading-tight">Sharing my unused UL ticket with students in our group</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Prices */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Prices</h2>
          <div className="flex gap-3">
            <div className="flex-1 bg-white rounded-2xl border border-neutral-100 p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-neutral-900">{settings.price_12h} SEK</div>
              <div className="text-sm text-neutral-500 mt-0.5">12 hours</div>
            </div>
            <div className="flex-1 bg-white rounded-2xl border border-neutral-100 p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-neutral-900">{settings.price_24h} SEK</div>
              <div className="text-sm text-neutral-500 mt-0.5">24 hours</div>
            </div>
          </div>
        </section>

        {/* Legend */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Legend</h2>
          <div className="bg-white rounded-2xl border border-neutral-100 p-4 shadow-sm">
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0"></span>
                <span className="text-sm text-neutral-700">Available</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-pink-500 flex-shrink-0"></span>
                <span className="text-sm text-neutral-700">Reserved for me</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0"></span>
                <span className="text-sm text-neutral-700">Reserved</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-neutral-300 flex-shrink-0"></span>
                <span className="text-sm text-neutral-700">Past / not bookable</span>
              </div>
            </div>
          </div>
        </section>

        {/* Timeline */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3">Schedule</h2>
          <TimelineView settings={settings} />
        </section>

        {/* Disclaimer */}
        <footer className="text-center py-4">
          <p className="text-xs text-neutral-400 leading-relaxed max-w-sm mx-auto">
            Personal ticket sharing for students in our WhatsApp group.
            This is a personal sharing arrangement, not a commercial service.
          </p>
          <a
            href="/admin/login"
            className="text-xs text-neutral-300 hover:text-neutral-400 mt-3 inline-block transition-colors"
          >
            Admin
          </a>
        </footer>
      </div>
    </main>
  );
}

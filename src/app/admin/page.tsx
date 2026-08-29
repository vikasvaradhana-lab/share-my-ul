import { createServerSupabase } from '@/lib/supabase-server';
import { redirect } from 'next/navigation';
import AdminDashboard from '@/components/admin/AdminDashboard';
import type { Settings } from '@/types';

export default async function AdminPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/admin/login');

  const adminEmail = process.env.ADMIN_GOOGLE_EMAIL?.toLowerCase().trim();
  const userEmail = user.email?.toLowerCase().trim();
  if (adminEmail && userEmail !== adminEmail) redirect('/admin/login?error=unauthorized');

  const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).single();

  const defaultSettings: Settings = {
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

  return (
    <AdminDashboard
      user={{ email: user.email ?? '', id: user.id }}
      initialSettings={(settings as Settings) ?? defaultSettings}
    />
  );
}

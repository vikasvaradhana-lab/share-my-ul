import { NextResponse } from 'next/server';
import { createServerSupabase, createAdminSupabase } from '@/lib/supabase-server';
import { stockholmMidnight, stockholmDateStr } from '@/lib/timezone';

async function assertAdmin(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const adminEmail = process.env.ADMIN_GOOGLE_EMAIL?.toLowerCase().trim();
  const userEmail = user.email?.toLowerCase().trim();
  if (adminEmail && userEmail !== adminEmail) return null;
  return user;
}

export async function GET(request: Request) {
  const user = await assertAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminSupabase();
  const todayMidnight = stockholmMidnight(stockholmDateStr(new Date())).toISOString();

  let totalViews = 0;
  let todayViews = 0;
  let whatsappClicks = 0;
  let recentLogs: Array<{ id: string; visited_at: string; event_type: string; referrer: string }> = [];

  try {
    // Check if table exists and query
    const { data: allVisits, error } = await admin
      .from('analytics_visits')
      .select('*')
      .order('visited_at', { ascending: false })
      .limit(100);

    if (!error && allVisits) {
      totalViews = allVisits.filter(v => v.event_type === 'pageview').length;
      todayViews = allVisits.filter(v => v.event_type === 'pageview' && v.visited_at >= todayMidnight).length;
      whatsappClicks = allVisits.filter(v => v.event_type === 'whatsapp_click').length;
      recentLogs = allVisits.slice(0, 15);
    } else {
      // Fallback from tracking endpoint
      const trackRes = await fetch(new URL('/api/track', request.url));
      if (trackRes.ok) {
        const json = await trackRes.json();
        totalViews = json.totalViews || 0;
        todayViews = json.totalViews || 0;
        whatsappClicks = json.whatsappClicks || 0;
      }
    }
  } catch {
    // Fallback
  }

  return NextResponse.json({
    totalViews,
    todayViews,
    whatsappClicks,
    recentLogs,
  });
}

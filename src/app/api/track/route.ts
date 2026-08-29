import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase-server';

// In-memory persistent cache for serverless instance lifespan
let inMemoryTotalViews = 0;
let inMemoryWhatsappClicks = 0;
const inMemoryLogs: Array<{ time: string; type: string; referrer?: string }> = [];

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const eventType = body.type === 'whatsapp_click' ? 'whatsapp_click' : 'pageview';
    const page = body.page || '/';
    const referrer = body.referrer || request.headers.get('referer') || 'direct';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    if (eventType === 'whatsapp_click') {
      inMemoryWhatsappClicks++;
    } else {
      inMemoryTotalViews++;
    }

    inMemoryLogs.unshift({
      time: new Date().toISOString(),
      type: eventType,
      referrer: referrer.includes('whatsapp') ? 'WhatsApp' : referrer.includes('share-my-ul') ? 'Internal' : 'Direct / Link',
    });
    if (inMemoryLogs.length > 50) inMemoryLogs.pop();

    // Attempt insert into Supabase analytics_visits table if created
    try {
      const admin = createAdminSupabase();
      await admin.from('analytics_visits').insert({
        page,
        event_type: eventType,
        referrer,
        user_agent: userAgent,
      });
    } catch {}

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true });
  }
}

export async function GET() {
  return NextResponse.json({
    totalViews: inMemoryTotalViews,
    whatsappClicks: inMemoryWhatsappClicks,
    logs: inMemoryLogs.slice(0, 10),
  });
}

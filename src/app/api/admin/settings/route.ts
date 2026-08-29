import { NextResponse } from 'next/server';
import { createServerSupabase, createAdminSupabase } from '@/lib/supabase-server';

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
  const { data, error } = await admin.from('settings').select('*').eq('id', 1).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

export async function PATCH(request: Request) {
  const user = await assertAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  // Only allow updating safe settings fields
  const allowed = [
    'ticket_valid_until', 'booking_cutoff', 'admin_timezone',
    'awake_start', 'awake_end', 'price_12h', 'price_24h',
    'recurring_wed', 'recurring_wed_start', 'recurring_wed_end',
    'recurring_fri', 'recurring_fri_start', 'recurring_fri_end',
  ];
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('settings')
    .update(updates)
    .eq('id', 1)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings: data });
}

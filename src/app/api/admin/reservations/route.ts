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

// GET: list reservations (admin-only history)
export async function GET(request: Request) {
  const user = await assertAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('reservations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reservations: data });
}

// POST: create reservation (mark a block as reserved with student info)
export async function POST(request: Request) {
  const user = await assertAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { block_id, starts_at, ends_at, duration_hours, price_sek, student_identifier } = body;

  if (!starts_at || !ends_at || !duration_hours || !price_sek) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }
  if (duration_hours !== 12 && duration_hours !== 24) {
    return NextResponse.json({ error: 'Invalid duration' }, { status: 400 });
  }

  const admin = createAdminSupabase();

  // Mark the block as RESERVED
  if (block_id) {
    await admin
      .from('schedule_blocks')
      .update({ status: 'RESERVED' })
      .eq('id', block_id);
  }

  const { data, error } = await admin
    .from('reservations')
    .insert({
      block_id,
      starts_at,
      ends_at,
      duration_hours,
      price_sek,
      student_identifier,
      status: 'ACTIVE',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reservation: data }, { status: 201 });
}

// PATCH: update reservation (complete / cancel)
export async function PATCH(request: Request) {
  const user = await assertAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { id, status, student_identifier } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const admin = createAdminSupabase();
  const updates: Record<string, unknown> = {};
  if (status) updates.status = status;
  if (status === 'COMPLETED') updates.completed_at = new Date().toISOString();
  if (student_identifier !== undefined) updates.student_identifier = student_identifier;

  const { data, error } = await admin
    .from('reservations')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reservation: data });
}

import { NextResponse } from 'next/server';
import { createServerSupabase, createAdminSupabase } from '@/lib/supabase-server';
import { hasOverlap } from '@/lib/availability';

async function assertAdmin(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const adminEmail = process.env.ADMIN_GOOGLE_EMAIL?.toLowerCase().trim();
  const userEmail = user.email?.toLowerCase().trim();
  if (adminEmail && userEmail !== adminEmail) return null;
  return user;
}

// GET: list blocks
export async function GET(request: Request) {
  const user = await assertAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from') ?? new Date().toISOString();
  const to = searchParams.get('to') ?? new Date(Date.now() + 90 * 86400000).toISOString();

  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from('schedule_blocks')
    .select('*')
    .gte('ends_at', from)
    .lte('starts_at', to)
    .order('starts_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ blocks: data });
}

// POST: create block
export async function POST(request: Request) {
  const user = await assertAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { starts_at, ends_at, status, private_note } = body;

  if (!starts_at || !ends_at || !status) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const admin = createAdminSupabase();

  // Overlap check
  const { data: existing } = await admin
    .from('schedule_blocks')
    .select('id, starts_at, ends_at')
    .or(`starts_at.lt.${ends_at},ends_at.gt.${starts_at}`);

  if (hasOverlap(new Date(starts_at), new Date(ends_at), existing ?? [])) {
    return NextResponse.json({ error: 'CONFLICT: overlaps existing block' }, { status: 409 });
  }

  const { data, error } = await admin
    .from('schedule_blocks')
    .insert({ starts_at, ends_at, status, private_note })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ block: data }, { status: 201 });
}

// PATCH: update block
export async function PATCH(request: Request) {
  const user = await assertAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { id, starts_at, ends_at, status, private_note } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const admin = createAdminSupabase();

  // Overlap check (excluding self)
  if (starts_at && ends_at) {
    const { data: existing } = await admin
      .from('schedule_blocks')
      .select('id, starts_at, ends_at')
      .or(`starts_at.lt.${ends_at},ends_at.gt.${starts_at}`)
      .neq('id', id);

    if (hasOverlap(new Date(starts_at), new Date(ends_at), existing ?? [])) {
      return NextResponse.json({ error: 'CONFLICT: overlaps existing block' }, { status: 409 });
    }
  }

  const { data, error } = await admin
    .from('schedule_blocks')
    .update({ starts_at, ends_at, status, private_note })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ block: data });
}

// DELETE: remove block
export async function DELETE(request: Request) {
  const user = await assertAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const admin = createAdminSupabase();
  const { error } = await admin.from('schedule_blocks').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

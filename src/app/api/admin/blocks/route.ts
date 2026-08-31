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
  const { starts_at, ends_at, status, private_note, overwrite, price_sek } = body;

  if (!starts_at || !ends_at || !status) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const newStart = new Date(starts_at);
  const newEnd = new Date(ends_at);

  // Overlap check
  const { data: existing } = await admin
    .from('schedule_blocks')
    .select('id, starts_at, ends_at, status, private_note')
    .or(`starts_at.lt.${ends_at},ends_at.gt.${starts_at}`);

  const overlapping = (existing ?? []).filter((b) => {
    const bStart = new Date(b.starts_at);
    const bEnd = new Date(b.ends_at);
    return newStart < bEnd && newEnd > bStart;
  });

  if (overlapping.length > 0) {
    if (overwrite) {
      // Overwrite: remove all overlapping blocks
      const overlappingIds = overlapping.map((b) => b.id);
      await admin.from('schedule_blocks').delete().in('id', overlappingIds);
    } else {
      return NextResponse.json({
        error: `CONFLICT: Overlaps ${overlapping.length} existing block(s).`,
        conflictCount: overlapping.length,
        hasConflict: true,
      }, { status: 409 });
    }
  }

  const { data, error } = await admin
    .from('schedule_blocks')
    .insert({ starts_at, ends_at, status, private_note })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If status is RESERVED, sync to reservations table
  if (status === 'RESERVED' && data) {
    const s = new Date(starts_at).getTime();
    const e = new Date(ends_at).getTime();
    const durationHours = Math.max(1, Math.round((e - s) / (3600 * 1000)));

    await admin.from('reservations').insert({
      block_id: data.id,
      starts_at: data.starts_at,
      ends_at: data.ends_at,
      duration_hours: durationHours <= 12 ? 12 : 24,
      price_sek: price_sek !== undefined ? Number(price_sek) : (durationHours <= 12 ? 25 : 30),
      student_identifier: private_note || 'Student Share',
      status: e <= Date.now() ? 'COMPLETED' : 'ACTIVE',
      completed_at: e <= Date.now() ? new Date().toISOString() : null,
    });
  }

  return NextResponse.json({ block: data }, { status: 201 });
}

// PATCH: update block
export async function PATCH(request: Request) {
  const user = await assertAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { id, starts_at, ends_at, status, private_note, overwrite, price_sek } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const admin = createAdminSupabase();

  // Overlap check (excluding self)
  if (starts_at && ends_at) {
    const newStart = new Date(starts_at);
    const newEnd = new Date(ends_at);

    const { data: existing } = await admin
      .from('schedule_blocks')
      .select('id, starts_at, ends_at, status, private_note')
      .or(`starts_at.lt.${ends_at},ends_at.gt.${starts_at}`)
      .neq('id', id);

    const overlapping = (existing ?? []).filter((b) => {
      const bStart = new Date(b.starts_at);
      const bEnd = new Date(b.ends_at);
      return newStart < bEnd && newEnd > bStart;
    });

    if (overlapping.length > 0) {
      if (overwrite) {
        const overlappingIds = overlapping.map((b) => b.id);
        await admin.from('schedule_blocks').delete().in('id', overlappingIds);
      } else {
        return NextResponse.json({
          error: `CONFLICT: Overlaps ${overlapping.length} existing block(s).`,
          conflictCount: overlapping.length,
          hasConflict: true,
        }, { status: 409 });
      }
    }
  }

  const { data, error } = await admin
    .from('schedule_blocks')
    .update({ starts_at, ends_at, status, private_note })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If status is RESERVED, update or create reservation
  if (status === 'RESERVED' && data) {
    const s = new Date(data.starts_at).getTime();
    const e = new Date(data.ends_at).getTime();
    const durationHours = Math.max(1, Math.round((e - s) / (3600 * 1000)));

    const { data: existingRes } = await admin
      .from('reservations')
      .select('id')
      .eq('block_id', data.id);

    if (existingRes && existingRes.length > 0) {
      const updatePayload: Record<string, unknown> = {
        starts_at: data.starts_at,
        ends_at: data.ends_at,
        duration_hours: durationHours <= 12 ? 12 : 24,
        student_identifier: private_note || 'Student Share',
      };
      if (price_sek !== undefined) updatePayload.price_sek = Number(price_sek);
      await admin.from('reservations').update(updatePayload).eq('id', existingRes[0].id);
    } else if (price_sek !== undefined) {
      await admin.from('reservations').insert({
        block_id: data.id,
        starts_at: data.starts_at,
        ends_at: data.ends_at,
        duration_hours: durationHours <= 12 ? 12 : 24,
        price_sek: Number(price_sek),
        student_identifier: private_note || 'Student Share',
        status: e <= Date.now() ? 'COMPLETED' : 'ACTIVE',
        completed_at: e <= Date.now() ? new Date().toISOString() : null,
      });
    }
  }

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

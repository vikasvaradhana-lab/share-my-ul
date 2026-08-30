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
  
  // 1. Fetch explicit reservations table entries
  const { data: resData } = await admin
    .from('reservations')
    .select('*')
    .order('created_at', { ascending: false });

  // 2. Fetch all schedule_blocks with status = 'RESERVED'
  const { data: blocksData } = await admin
    .from('schedule_blocks')
    .select('*')
    .eq('status', 'RESERVED')
    .order('starts_at', { ascending: false });

  // 3. Fetch settings for pricing fallback
  const { data: settingsData } = await admin
    .from('settings')
    .select('*')
    .eq('id', 1)
    .single();

  const price12 = settingsData?.price_12h ?? 25;
  const price24 = settingsData?.price_24h ?? 30;

  const existingBlockIds = new Set((resData ?? []).map(r => r.block_id).filter(Boolean));

  const synthesizedFromBlocks = (blocksData ?? [])
    .filter(b => !existingBlockIds.has(b.id))
    .map(b => {
      const s = new Date(b.starts_at).getTime();
      const e = new Date(b.ends_at).getTime();
      const durationHours = Math.max(1, Math.round((e - s) / (3600 * 1000)));
      const price = durationHours <= 12 ? price12 : price24;
      const isPast = e <= Date.now();

      return {
        id: b.id,
        block_id: b.id,
        starts_at: b.starts_at,
        ends_at: b.ends_at,
        duration_hours: durationHours,
        price_sek: price,
        student_identifier: b.private_note || 'Student Share',
        status: isPast ? 'COMPLETED' : 'ACTIVE',
        created_at: b.created_at,
        completed_at: isPast ? b.ends_at : null,
      };
    });

  const combined = [...(resData ?? []), ...synthesizedFromBlocks].sort(
    (a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime()
  );

  return NextResponse.json({ reservations: combined });
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

  // 1. Try updating in reservations table
  const { data: resData } = await admin
    .from('reservations')
    .update(updates)
    .eq('id', id)
    .select();

  if (resData && resData.length > 0) {
    return NextResponse.json({ reservation: resData[0] });
  }

  // 2. If it was synthesized from schedule_blocks, insert an explicit reservation record
  const { data: block } = await admin
    .from('schedule_blocks')
    .select('*')
    .eq('id', id)
    .single();

  if (block) {
    const s = new Date(block.starts_at).getTime();
    const e = new Date(block.ends_at).getTime();
    const durationHours = Math.max(1, Math.round((e - s) / (3600 * 1000)));

    const { data: settingsData } = await admin.from('settings').select('*').eq('id', 1).single();
    const price = durationHours <= 12 ? (settingsData?.price_12h ?? 25) : (settingsData?.price_24h ?? 30);

    const { data: inserted, error: insertError } = await admin
      .from('reservations')
      .insert({
        block_id: block.id,
        starts_at: block.starts_at,
        ends_at: block.ends_at,
        duration_hours: durationHours,
        price_sek: price,
        student_identifier: student_identifier ?? block.private_note,
        status: status ?? 'COMPLETED',
        completed_at: status === 'COMPLETED' ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (!insertError && inserted) {
      return NextResponse.json({ reservation: inserted });
    }
  }

  return NextResponse.json({ success: true });
}

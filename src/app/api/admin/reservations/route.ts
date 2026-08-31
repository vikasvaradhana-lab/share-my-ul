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

/**
 * Calculate price for any duration (including multi-day spans).
 * E.g., 12h = 25 SEK, 24h = 30 SEK, 48h = 60 SEK, 84h = 3x30 + 25 = 115 SEK
 */
export function calculateSlotPrice(durationHours: number, price12h: number, price24h: number): number {
  if (durationHours <= 0) return 0;
  if (durationHours <= 12) return price12h;
  if (durationHours <= 24) return price24h;

  const fullDays = Math.floor(durationHours / 24);
  const remHours = durationHours % 24;

  let remainderPrice = 0;
  if (remHours > 0) {
    if (remHours <= 12) {
      remainderPrice = price12h;
    } else {
      remainderPrice = price24h;
    }
  }
  return (fullDays * price24h) + remainderPrice;
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

  // 3. Fetch settings for pricing
  const { data: settingsData } = await admin
    .from('settings')
    .select('*')
    .eq('id', 1)
    .single();

  const price12 = settingsData?.price_12h ?? 25;
  const price24 = settingsData?.price_24h ?? 30;

  // Map reservations by block_id for fast lookup
  const resByBlockId = new Map<string, any>();
  const explicitRes = (resData ?? []).map(r => {
    if (r.block_id) resByBlockId.set(r.block_id, r);
    return r;
  });

  const synthesizedFromBlocks = (blocksData ?? [])
    .filter(b => !resByBlockId.has(b.id))
    .map(b => {
      const s = new Date(b.starts_at).getTime();
      const e = new Date(b.ends_at).getTime();
      const durationHours = Math.max(1, Math.round((e - s) / (3600 * 1000)));
      const price = calculateSlotPrice(durationHours, price12, price24);
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

  const combined = [...explicitRes, ...synthesizedFromBlocks].sort(
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

  if (!starts_at || !ends_at || !duration_hours || price_sek === undefined) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const admin = createAdminSupabase();

  // Mark the block as RESERVED if provided
  if (block_id) {
    await admin
      .from('schedule_blocks')
      .update({ status: 'RESERVED', private_note: student_identifier || null })
      .eq('id', block_id);
  }

  const { data, error } = await admin
    .from('reservations')
    .insert({
      block_id,
      starts_at,
      ends_at,
      duration_hours,
      price_sek: Number(price_sek),
      student_identifier,
      status: 'ACTIVE',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reservation: data }, { status: 201 });
}

// PATCH: update reservation (complete / cancel / custom price / note)
export async function PATCH(request: Request) {
  const user = await assertAdmin(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { id, status, student_identifier, price_sek } = body;
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const admin = createAdminSupabase();
  const updates: Record<string, unknown> = {};
  if (status) updates.status = status;
  if (status === 'COMPLETED') updates.completed_at = new Date().toISOString();
  if (student_identifier !== undefined) updates.student_identifier = student_identifier;
  if (price_sek !== undefined) updates.price_sek = Number(price_sek);

  // 1. Check if reservation exists in reservations table by id OR block_id
  const { data: existingRes } = await admin
    .from('reservations')
    .select('*')
    .or(`id.eq.${id},block_id.eq.${id}`);

  if (existingRes && existingRes.length > 0) {
    const targetReservationId = existingRes[0].id;
    const { data: updated, error: updateErr } = await admin
      .from('reservations')
      .update(updates)
      .eq('id', targetReservationId)
      .select()
      .single();

    // Also sync private note to schedule_blocks if associated
    if (existingRes[0].block_id && student_identifier !== undefined) {
      await admin
        .from('schedule_blocks')
        .update({ private_note: student_identifier })
        .eq('id', existingRes[0].block_id);
    }

    if (!updateErr && updated) {
      return NextResponse.json({ reservation: updated });
    }
  }

  // 2. If not yet in reservations table, check schedule_blocks by id
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
    const price12 = settingsData?.price_12h ?? 25;
    const price24 = settingsData?.price_24h ?? 30;
    const defaultPrice = calculateSlotPrice(durationHours, price12, price24);
    const finalPrice = price_sek !== undefined ? Number(price_sek) : defaultPrice;

    if (student_identifier !== undefined) {
      await admin
        .from('schedule_blocks')
        .update({ private_note: student_identifier })
        .eq('id', block.id);
    }

    const { data: inserted, error: insertError } = await admin
      .from('reservations')
      .insert({
        block_id: block.id,
        starts_at: block.starts_at,
        ends_at: block.ends_at,
        duration_hours: durationHours,
        price_sek: finalPrice,
        student_identifier: student_identifier ?? block.private_note ?? 'Student Share',
        status: status ?? (e <= Date.now() ? 'COMPLETED' : 'ACTIVE'),
        completed_at: status === 'COMPLETED' || e <= Date.now() ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (!insertError && inserted) {
      return NextResponse.json({ reservation: inserted });
    }
  }

  return NextResponse.json({ success: true });
}

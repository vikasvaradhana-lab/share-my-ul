import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import type { PublicBlock } from '@/types';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json({ error: 'from and to params required' }, { status: 400 });
    }

    const supabase = await createServerSupabase();

    const { data, error } = await supabase
      .from('public_schedule') // uses the view that strips private_note
      .select('id, starts_at, ends_at, status, created_at')
      .gte('ends_at', from)
      .lte('starts_at', to)
      .order('starts_at', { ascending: true });

    if (error) {
      console.error('availability fetch error:', error);
      return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 });
    }

    const blocks: PublicBlock[] = (data ?? []).map((b) => ({
      id: b.id,
      starts_at: b.starts_at,
      ends_at: b.ends_at,
      status: b.status,
      created_at: b.created_at,
    }));

    return NextResponse.json({ blocks });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

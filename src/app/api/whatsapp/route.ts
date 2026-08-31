import { NextResponse } from 'next/server';
import { toStockholmTime, formatDateStockholm, STOCKHOLM_TZ } from '@/lib/timezone';
import type { WhatsAppRequest } from '@/types';

export async function POST(request: Request) {
  try {
    const body: WhatsAppRequest = await request.json();
    const { startsAt, endsAt, duration, price } = body;

    if (!startsAt || !endsAt || !duration || !price) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    if (duration <= 0) {
      return NextResponse.json({ error: 'Invalid duration' }, { status: 400 });
    }

    const startDate = new Date(startsAt);
    const endDate = new Date(endsAt);

    // Format display times in Stockholm tz
    const dateDisplay = formatDateStockholm(startDate);
    const startTime = toStockholmTime(startDate);
    const endTime = toStockholmTime(endDate);

    const message =
      `Hi there, I'd like to request the UL ticket.\n\n` +
      `Date: ${dateDisplay}\n` +
      `Time: ${startTime} → ${endTime}\n` +
      `Duration: ${duration} hours\n` +
      `Price: ${price} SEK`;

    // Phone number lives only in server env — never exposed to client
    const rawPhone = process.env.WHATSAPP_NUMBER;
    if (!rawPhone) {
      return NextResponse.json({ error: 'WhatsApp not configured' }, { status: 500 });
    }

    const phone = rawPhone.replace(/[^0-9]/g, '');
    const encoded = encodeURIComponent(message);
    const waLink = `https://wa.me/${phone}?text=${encoded}`;

    return NextResponse.json({ link: waLink, message });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

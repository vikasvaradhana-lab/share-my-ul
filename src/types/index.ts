// ============================================================
// Shared TypeScript types for Share My UL
// ============================================================

export type BlockStatus = 'AVAILABLE' | 'RESERVED_FOR_ME' | 'RESERVED';
export type ReservationStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface Settings {
  id: number;
  ticket_valid_until: string; // ISO timestamptz
  booking_cutoff: string;     // ISO timestamptz
  admin_timezone: string;     // IANA tz string e.g. 'Asia/Kolkata'
  awake_start: string;        // HH:MM e.g. '06:30'
  awake_end: string;          // HH:MM e.g. '22:30'
  price_12h: number;
  price_24h: number;
  recurring_wed: boolean;
  recurring_wed_start?: string; // HH:MM e.g. '00:00'
  recurring_wed_end?: string;   // HH:MM e.g. '24:00'
  recurring_fri: boolean;
  recurring_fri_start?: string; // HH:MM e.g. '00:00'
  recurring_fri_end?: string;   // HH:MM e.g. '24:00'
  updated_at: string;
}

/** Public-safe version of a schedule block (no private_note) */
export interface PublicBlock {
  id: string;
  starts_at: string; // ISO
  ends_at: string;   // ISO
  status: BlockStatus;
  created_at: string;
}

/** Full block (admin only) */
export interface ScheduleBlock extends PublicBlock {
  private_note: string | null;
  updated_at: string;
}

export interface Reservation {
  id: string;
  block_id: string | null;
  starts_at: string;
  ends_at: string;
  duration_hours: 12 | 24;
  price_sek: number;
  student_identifier: string | null;
  status: ReservationStatus;
  created_at: string;
  completed_at: string | null;
}

export interface BookingOption {
  duration: 12 | 24;
  price: number;
  startsAt: Date;  // UTC
  endsAt: Date;    // UTC
  valid: boolean;
  reason?: string; // why invalid, if applicable
}

export interface WhatsAppRequest {
  startsAt: string;  // ISO UTC
  endsAt: string;    // ISO UTC
  duration: 12 | 24;
  price: number;
}

-- ============================================================
-- Share My UL — Supabase Schema
-- Run this in the Supabase SQL Editor ONCE to set up the DB.
-- ============================================================

-- ─── Custom Types ────────────────────────────────────────────
CREATE TYPE block_status AS ENUM ('AVAILABLE', 'RESERVED_FOR_ME', 'RESERVED');
CREATE TYPE reservation_status AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- ─── Settings (singleton row, id=1) ─────────────────────────
CREATE TABLE public.settings (
  id                  int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ticket_valid_until  timestamptz NOT NULL DEFAULT '2026-09-30 21:59:00+00',
  booking_cutoff      timestamptz NOT NULL DEFAULT '2026-09-27 21:59:00+00',
  admin_timezone      text        NOT NULL DEFAULT 'Asia/Kolkata',
  awake_start         time        NOT NULL DEFAULT '06:30:00',
  awake_end           time        NOT NULL DEFAULT '22:30:00',
  price_12h           int         NOT NULL DEFAULT 25,
  price_24h           int         NOT NULL DEFAULT 30,
  recurring_wed       boolean     NOT NULL DEFAULT true,
  recurring_wed_start text        DEFAULT '00:00',
  recurring_wed_end   text        DEFAULT '24:00',
  recurring_fri       boolean     NOT NULL DEFAULT true,
  recurring_fri_start text        DEFAULT '00:00',
  recurring_fri_end   text        DEFAULT '24:00',
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── Schedule Blocks ─────────────────────────────────────────
CREATE TABLE public.schedule_blocks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_at    timestamptz NOT NULL,
  ends_at      timestamptz NOT NULL,
  status       block_status NOT NULL DEFAULT 'AVAILABLE',
  private_note text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_period CHECK (ends_at > starts_at)
);

CREATE INDEX idx_schedule_blocks_range ON public.schedule_blocks (starts_at, ends_at);

-- ─── Reservations (historical record) ────────────────────────
CREATE TABLE public.reservations (
  id                 uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id           uuid              REFERENCES public.schedule_blocks(id) ON DELETE SET NULL,
  starts_at          timestamptz       NOT NULL,
  ends_at            timestamptz       NOT NULL,
  duration_hours     int               NOT NULL CHECK (duration_hours IN (12, 24)),
  price_sek          int               NOT NULL,
  student_identifier text,            -- PRIVATE: never exposed via public API
  status             reservation_status NOT NULL DEFAULT 'ACTIVE',
  created_at         timestamptz       NOT NULL DEFAULT now(),
  completed_at       timestamptz
);

CREATE INDEX idx_reservations_status ON public.reservations (status);

-- ─── Admin Helper Function ────────────────────────────────────
-- Checks if the currently authenticated user is the admin.
-- The ADMIN_GOOGLE_EMAIL is stored in Supabase secrets / env vars.
-- We check against the auth.users metadata.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = auth.uid()
    AND email = current_setting('app.admin_email', true)
  );
$$;

-- ─── Row Level Security ───────────────────────────────────────
ALTER TABLE public.settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations    ENABLE ROW LEVEL SECURITY;

-- Settings: anyone can read safe columns, only admin can write
CREATE POLICY "Public can read settings"
  ON public.settings FOR SELECT
  USING (true);

CREATE POLICY "Admin can update settings"
  ON public.settings FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Schedule blocks: public SELECT (private_note excluded via view), admin all
CREATE POLICY "Public can read schedule blocks"
  ON public.schedule_blocks FOR SELECT
  USING (true);

CREATE POLICY "Admin can insert blocks"
  ON public.schedule_blocks FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin can update blocks"
  ON public.schedule_blocks FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin can delete blocks"
  ON public.schedule_blocks FOR DELETE
  USING (public.is_admin());

-- Reservations: ONLY admin can read/write (never public)
CREATE POLICY "Admin only reservations"
  ON public.reservations FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ─── Public-safe view (strips private_note) ──────────────────
CREATE OR REPLACE VIEW public.public_schedule AS
  SELECT id, starts_at, ends_at, status, created_at
  FROM public.schedule_blocks;

GRANT SELECT ON public.public_schedule TO anon, authenticated;

-- ─── Update trigger for updated_at ───────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_schedule_blocks_updated_at
  BEFORE UPDATE ON public.schedule_blocks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── Analytics / Visitor Tracking ────────────────────────────
CREATE TABLE IF NOT EXISTS public.analytics_visits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visited_at  timestamptz NOT NULL DEFAULT now(),
  page        text NOT NULL DEFAULT '/',
  referrer    text,
  event_type  text NOT NULL DEFAULT 'pageview',
  user_agent  text
);

CREATE INDEX IF NOT EXISTS idx_analytics_visits_date ON public.analytics_visits (visited_at);

ALTER TABLE public.analytics_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert for analytics"
  ON public.analytics_visits
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow admin to read analytics"
  ON public.analytics_visits
  FOR SELECT
  TO authenticated
  USING (public.is_admin());


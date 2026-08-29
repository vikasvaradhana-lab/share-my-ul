-- ============================================================
-- Share My UL — Seed Data
-- Run AFTER schema.sql.
-- ============================================================

-- Insert the singleton settings row
INSERT INTO public.settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

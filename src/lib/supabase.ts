// This barrel export only exposes the browser-safe client.
// Server-only files should import from @/lib/supabase-server directly.
export { createBrowserSupabase } from './supabase-browser';

// Browser Supabase client using @supabase/ssr to ensure cookies & PKCE flow work
import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Browser/client-side Supabase client with cookie support.
 * Safe to use in 'use client' components.
 */
export function createBrowserSupabase() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

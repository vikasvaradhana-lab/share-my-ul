// Server-only Supabase client — uses next/headers cookies
// ONLY import this in Server Components and Route Handlers
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Server-side Supabase client that reads session from cookies.
 * Use in Server Components, Route Handlers.
 */
export async function createServerSupabase() {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Ignored in Server Components — middleware handles session refresh
        }
      },
    },
  });
}

/**
 * Admin-only service-role client that bypasses RLS.
 * NEVER use on client side. Only in secure server Route Handlers.
 */
export function createAdminSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

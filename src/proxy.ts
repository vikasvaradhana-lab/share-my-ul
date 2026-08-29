import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session
  const { data: { user } } = await supabase.auth.getUser();

  const isAdminRoute = request.nextUrl.pathname.startsWith('/admin');

  if (isAdminRoute && request.nextUrl.pathname !== '/admin/login') {
    if (!user) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }

    // Double-check the user is the authorised admin email
    const adminEmail = process.env.ADMIN_GOOGLE_EMAIL?.toLowerCase().trim();
    const userEmail = user.email?.toLowerCase().trim();
    if (adminEmail && userEmail !== adminEmail) {
      return NextResponse.redirect(new URL('/admin/login?error=unauthorized', request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/admin/:path*'],
};

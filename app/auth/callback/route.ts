import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/login';

  if (!code) {
    return NextResponse.redirect(new URL('/login', requestUrl.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('Error exchanging code for session:', error);
    return NextResponse.redirect(new URL('/login?error=auth_callback_error', requestUrl.origin));
  }

  // Verificar si es un reset de contraseña
  const session = data?.session;
  if (session?.user) {
    // Verificar si viene de un reset password
    if (requestUrl.searchParams.get('type') === 'recovery') {
      return NextResponse.redirect(new URL('/auth/reset-password', requestUrl.origin));
    }
  }

  // Para confirmación de email normal, ir a login o la ruta especificada
  return NextResponse.redirect(new URL(next, requestUrl.origin));
}

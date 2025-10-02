import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const next = requestUrl.searchParams.get('next') || '/welcome';

  if (!code) {
    return NextResponse.redirect(new URL('/error', requestUrl.origin));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL('/error', requestUrl.origin));
  }

  // Verificar si es un reset de contraseña
  // Supabase marca la sesión con un evento de recuperación
  const session = data?.session;
  if (session?.user) {
    // Si el usuario acaba de hacer un reset, redirigir a la página de cambio de contraseña
    const { data: { user } } = await supabase.auth.getUser();
    
    // Verificar si hay un recovery token o si viene de un reset password
    if (requestUrl.searchParams.get('type') === 'recovery' || 
        requestUrl.hash.includes('type=recovery')) {
      return NextResponse.redirect(new URL('/auth/reset-password', requestUrl.origin));
    }
  }

  // Para confirmación de email normal, ir a welcome o la ruta especificada
  return NextResponse.redirect(new URL(next, requestUrl.origin));
}

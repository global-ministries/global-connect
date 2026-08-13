/**
 * TEMP DEBUG ENDPOINT — diagnose why PR23.2a detail page shows 0 ediciones
 * even though DB has 3.
 *
 * Same query the page uses, but exposed as JSON so we can see what the
 * server-side client actually returns under your auth.
 *
 * DELETE after PR23.2a verification.
 */

import { NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  findPlatformSessionPersonaByAuthId,
  resolveReadOnlyPlatformSession,
} from '@/lib/auth/platformSessionReadOnly'

export async function GET(): Promise<NextResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- server client
  const supabase: any = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ stage: 'no_session' }, { status: 401 })
  }

  // 1. Find the taller
  const { data: tallerData, error: tallerError } = await supabase
    .from('talleres')
    .select('id, slug, nombre, modalidad_default, estado')
    .eq('slug', 'matrimonio-sobre-la-roca')
    .maybeSingle()

  if (tallerError) {
    return NextResponse.json({ stage: 'taller_error', error: tallerError.message }, { status: 500 })
  }
  if (!tallerData) {
    return NextResponse.json({ stage: 'no_taller_with_slug' }, { status: 404 })
  }

  // 2. Fetch ediciones with the same query the detail page uses
  const { data: edicionesData, error: edicionesError } = await supabase
    .from('talleres_crecimiento_metadata')
    .select('id, nombre_snapshot, estado, created_at, taller_id')
    .eq('taller_id', tallerData.id)
    .order('created_at', { ascending: false })
    .limit(100)

  return NextResponse.json({
    stage: 'ok',
    auth_user: { id: user.id, email: user.email },
    taller_found: tallerData,
    ediciones_count: (edicionesData ?? []).length,
    ediciones: edicionesData ?? [],
    ediciones_error: edicionesError?.message ?? null,
  })
}

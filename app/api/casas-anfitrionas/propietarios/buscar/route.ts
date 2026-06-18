import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { obtenerUsuariosAsignablesCasaAnfitriona } from '@/lib/casas-anfitrionas/assignable-users'

const DEFAULT_LIMIT = 30

function puedeAsignarPropietarios(permisos: unknown): boolean {
  return Boolean(
    permisos &&
      typeof permisos === 'object' &&
      !Array.isArray(permisos) &&
      'puede_crear_para_otros' in permisos &&
      permisos.puede_crear_para_otros === true
  )
}

function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_LIMIT

  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : DEFAULT_LIMIT
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = (searchParams.get('q') ?? '').trim()
    const currentCasaId = searchParams.get('casaId') ?? undefined
    const limit = parseLimit(searchParams.get('limit'))

    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    if (currentCasaId) {
      const { data: puedeEditar, error: permissionError } = await supabase.rpc('puede_editar_casa_anfitriona', {
        p_auth_id: user.id,
        p_casa_id: currentCasaId,
      })

      if (permissionError || puedeEditar !== true) {
        return NextResponse.json({ error: 'No tienes permisos para editar esta casa' }, { status: 403 })
      }
    }

    const { data: permisosCasa, error: permisosError } = await supabase.rpc(
      'obtener_permisos_casa_anfitriona',
      currentCasaId
        ? { p_auth_id: user.id, p_casa_id: currentCasaId }
        : { p_auth_id: user.id }
    )

    if (permisosError || !puedeAsignarPropietarios(permisosCasa)) {
      return NextResponse.json({ error: 'No tienes permisos para asignar propietarios' }, { status: 403 })
    }

    const adminDb = createSupabaseAdminClient()
    const usuarios = await obtenerUsuariosAsignablesCasaAnfitriona({
      supabase,
      adminDb,
      authId: user.id,
      currentCasaId,
      busqueda: q,
      limit,
    })

    return NextResponse.json({ usuarios })
  } catch (error) {
    console.error('[casas-anfitrionas/propietarios/buscar] Error:', error)

    return NextResponse.json(
      { error: 'Error al buscar propietarios' },
      { status: 500 }
    )
  }
}

/**
 * Dream Team — PUT /api/dream-team/turnos/[id]/fechas/[fechaId]/servidores
 * (T2 of odd/tasks/tlr-calendario-servicios.md, S2, S4).
 *
 * { servicioIds } → { sirven }: replaces who serves on the planned date with
 * these servicios ("Todos" sends every one assigned to the shift; an empty
 * list clears the date). dream_team_turno_fecha_servidores_fijar decides who
 * may (42501 → 403) and refuses a servicio not assigned to the shift (422).
 */
import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { validarServicioIds } from '@/lib/platform/dream-team/turno-fechas'
import { fijarServidoresDeFecha } from '@/lib/platform/dream-team/turnos'

import { leerCuerpo, rechazoPrevio, resolverParams, respuestaDeError, type Ctx } from '../../../../_compartido'

export async function PUT(req: NextRequest, ctx: Ctx<{ id: string; fechaId: string }>) {
  try {
    const { id, fechaId } = await resolverParams(ctx)
    const rechazo = await rechazoPrevio([id, fechaId])
    if (rechazo) return rechazo
    const cuerpo = await leerCuerpo(req)
    if (!cuerpo) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    const validacion = validarServicioIds(cuerpo.servicioIds)
    if (!validacion.ok) return NextResponse.json({ error: validacion.message }, { status: 400 })

    try {
      const sirven = await fijarServidoresDeFecha(await createSupabaseServerClient(), fechaId, validacion.servicioIds)
      return NextResponse.json({ sirven })
    } catch (error) {
      return respuestaDeError(error, 'PUT servidores')
    }
  } catch (error) {
    console.error('[dream-team/turnos/[id]/fechas/[fechaId]/servidores] PUT error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

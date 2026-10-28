/**
 * Dream Team — POST /api/dream-team/turnos/[id]/fechas (T2 of
 * odd/tasks/tlr-calendario-servicios.md, S1, A1).
 *
 * { fecha, hora?, nota? } → { id }: plans a date of a dated shift (an already
 * planned date gets its hora and nota replaced). dream_team_turno_fecha_guardar
 * decides who may (42501 → 403) and what is valid (422).
 */
import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { validarFechaTurno } from '@/lib/platform/dream-team/turno-fechas'
import { guardarFechaDeTurno } from '@/lib/platform/dream-team/turnos'

import { leerCuerpo, rechazoPrevio, resolverParams, respuestaDeError, type Ctx } from '../../_compartido'

export async function POST(req: NextRequest, ctx: Ctx<{ id: string }>) {
  try {
    const { id } = await resolverParams(ctx)
    const rechazo = await rechazoPrevio([id])
    if (rechazo) return rechazo
    const cuerpo = await leerCuerpo(req)
    if (!cuerpo) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    const validacion = validarFechaTurno(cuerpo)
    if (!validacion.ok) return NextResponse.json({ error: validacion.message }, { status: 400 })

    try {
      const turnoFechaId = await guardarFechaDeTurno(await createSupabaseServerClient(), id, validacion.datos)
      return NextResponse.json({ id: turnoFechaId })
    } catch (error) {
      return respuestaDeError(error, 'POST fechas')
    }
  } catch (error) {
    console.error('[dream-team/turnos/[id]/fechas] POST error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

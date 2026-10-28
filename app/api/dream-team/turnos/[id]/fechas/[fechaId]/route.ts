/**
 * Dream Team — one planned date of a dated shift (T2 of
 * odd/tasks/tlr-calendario-servicios.md, S1, A1).
 *
 * PATCH  { fecha, hora?, nota? } → { id }: moves or edits the date (its
 *        volunteers stay); onto a date already planned → 409.
 * DELETE → { borrada: true }: deletes the date and who serves on it.
 *
 * The database functions decide who may (42501 → 403) and what is valid.
 */
import { NextRequest, NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { validarFechaTurno } from '@/lib/platform/dream-team/turno-fechas'
import { borrarFechaDeTurno, guardarFechaDeTurno } from '@/lib/platform/dream-team/turnos'

import { leerCuerpo, rechazoPrevio, resolverParams, respuestaDeError, type Ctx } from '../../../_compartido'

type Params = { id: string; fechaId: string }

export async function PATCH(req: NextRequest, ctx: Ctx<Params>) {
  try {
    const { id, fechaId } = await resolverParams(ctx)
    const rechazo = await rechazoPrevio([id, fechaId])
    if (rechazo) return rechazo
    const cuerpo = await leerCuerpo(req)
    if (!cuerpo) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    const validacion = validarFechaTurno(cuerpo)
    if (!validacion.ok) return NextResponse.json({ error: validacion.message }, { status: 400 })

    try {
      return NextResponse.json({ id: await guardarFechaDeTurno(await createSupabaseServerClient(), id, validacion.datos, fechaId) })
    } catch (error) {
      return respuestaDeError(error, 'PATCH fecha')
    }
  } catch (error) {
    console.error('[dream-team/turnos/[id]/fechas/[fechaId]] PATCH error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx<Params>) {
  try {
    const { id, fechaId } = await resolverParams(ctx)
    const rechazo = await rechazoPrevio([id, fechaId])
    if (rechazo) return rechazo

    try {
      await borrarFechaDeTurno(await createSupabaseServerClient(), fechaId)
      return NextResponse.json({ borrada: true })
    } catch (error) {
      return respuestaDeError(error, 'DELETE fecha')
    }
  } catch (error) {
    console.error('[dream-team/turnos/[id]/fechas/[fechaId]] DELETE error:', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

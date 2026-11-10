/**
 * POST /api/talleres/reserva/codigo/reenviar — a new code for the same request (S11).
 * Public, no session; see ../../_lib/atender.ts and
 * lib/platform/talleres/reserva-publica-servidor.ts (reenviarCodigoReserva).
 */
import type { NextRequest } from 'next/server'

import { reenviarCodigoReserva } from '@/lib/platform/talleres/reserva-publica-servidor'

import { atender } from '../../_lib/atender'

export async function POST(req: NextRequest) {
  return atender(req, 'codigo/reenviar', reenviarCodigoReserva)
}

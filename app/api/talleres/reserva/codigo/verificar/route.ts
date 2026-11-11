/**
 * POST /api/talleres/reserva/codigo/verificar — the one-time code → a reservation token (S3).
 * Public, no session; see ../../_lib/atender.ts and
 * lib/platform/talleres/reserva-publica-servidor.ts (verificarCodigoReserva).
 */
import type { NextRequest } from 'next/server'

import { verificarCodigoReserva } from '@/lib/platform/talleres/reserva-publica-servidor'

import { atender } from '../../_lib/atender'

export async function POST(req: NextRequest) {
  return atender(req, 'codigo/verificar', verificarCodigoReserva)
}

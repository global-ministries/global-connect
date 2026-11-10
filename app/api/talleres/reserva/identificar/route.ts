/**
 * POST /api/talleres/reserva/identificar — cédula → código al correo de la ficha, persona nueva o sin correo (S3, S4, S11).
 * Public, no session; see ../_lib/atender.ts and
 * lib/platform/talleres/reserva-publica-servidor.ts (identificarReserva).
 */
import type { NextRequest } from 'next/server'

import { identificarReserva } from '@/lib/platform/talleres/reserva-publica-servidor'

import { atender } from '../_lib/atender'

export async function POST(req: NextRequest) {
  return atender(req, 'identificar', identificarReserva)
}

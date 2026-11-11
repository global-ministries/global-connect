/**
 * POST /api/talleres/reserva/crear — the inscription, always pending approval; a new person gets the /activar email (S4, S5, S12).
 * Public, no session; see ../_lib/atender.ts and
 * lib/platform/talleres/reserva-publica-servidor.ts (crearReserva).
 */
import type { NextRequest } from 'next/server'

import { crearReserva } from '@/lib/platform/talleres/reserva-publica-servidor'

import { atender } from '../_lib/atender'

export async function POST(req: NextRequest) {
  return atender(req, 'crear', crearReserva)
}

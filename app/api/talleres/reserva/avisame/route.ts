/**
 * POST /api/talleres/reserva/avisame — «avísame si se libera un lugar» (S13).
 * Public, no session; see ../_lib/atender.ts and
 * lib/platform/talleres/reserva-publica-servidor.ts (avisameLugar).
 */
import type { NextRequest } from 'next/server'

import { avisameLugar } from '@/lib/platform/talleres/reserva-publica-servidor'

import { atender } from '../_lib/atender'

export async function POST(req: NextRequest) {
  return atender(req, 'avisame', avisameLugar)
}

/**
 * `textos-invitacion` (T4/T5 of odd/tasks/invitaciones-pendientes.md, S7): the
 * history of the invitation to register. A later row after an earlier one is
 * a resend ("Reenviada"); a latest row that was cancelled reads "Invitación
 * cancelada" with its date instead.
 */
import { entradasHistorial, fechaCorta } from '@/components/cuentas/textos-invitacion'
import type { EnvioHistorial, ResumenInvitacion } from '@/lib/platform/cuentas/invitaciones-pendientes'

const PRIMERO = '2026-10-01T10:00:00.000Z'
const SEGUNDO = '2026-10-09T10:00:00.000Z'

function resumen(historial: EnvioHistorial[], estado: ResumenInvitacion['estado']): ResumenInvitacion {
  const ultima = historial[historial.length - 1]
  return {
    usuarioId: 'p-1',
    estado,
    email: ultima.email,
    enviadaEl: ultima.fecha,
    aceptadaEl: null,
    invitadoPor: ultima.invitadoPor,
    envios: historial.length,
    historial,
  }
}

const envio = (estado: EnvioHistorial['estado'], fecha: string, invitadoPor = 'Edmir Muñoz'): EnvioHistorial => ({
  estado,
  email: 'ana@example.test',
  fecha,
  invitadoPor,
})

const textos = (r: ResumenInvitacion) => entradasHistorial(r).map((e) => [e.texto, e.email ?? null, e.detalle])

describe('entradasHistorial', () => {
  it('a newer row after an earlier one is a resend', () => {
    expect(textos(resumen([envio('cancelada', PRIMERO), envio('enviada', SEGUNDO, 'Edith Pérez')], 'enviada'))).toEqual([
      ['Invitación para crear su cuenta enviada a', 'ana@example.test', `${fechaCorta(PRIMERO)} · por Edmir Muñoz`],
      ['Reenviada', null, `${fechaCorta(SEGUNDO)} · por Edith Pérez`],
    ])
  })

  it('a cancelled latest row reads "Invitación cancelada" with its date, not "Reenviada"', () => {
    expect(textos(resumen([envio('cancelada', PRIMERO), envio('cancelada', SEGUNDO)], 'sin_invitar'))).toEqual([
      ['Invitación para crear su cuenta enviada a', 'ana@example.test', `${fechaCorta(PRIMERO)} · por Edmir Muñoz`],
      ['Invitación cancelada', null, fechaCorta(SEGUNDO)],
    ])
  })

  it('a single cancelled row keeps its send and then reads "Invitación cancelada"', () => {
    expect(textos(resumen([envio('cancelada', PRIMERO)], 'sin_invitar'))).toEqual([
      ['Invitación para crear su cuenta enviada a', 'ana@example.test', `${fechaCorta(PRIMERO)} · por Edmir Muñoz`],
      ['Invitación cancelada', null, fechaCorta(PRIMERO)],
    ])
  })
})

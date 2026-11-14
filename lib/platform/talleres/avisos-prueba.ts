/**
 * «Enviarme una prueba» (R4b of odd/tasks/talleres-rediseno.md, S10 S11;
 * L13; design/talleres-avisos/02): the draft of a notice rendered with
 * sample data into the SAME email the real notices use (TallerAvisoEmail
 * inside EmailLayout, with the church logo), «Prueba ·» in the subject, to
 * whoever edits only. It never goes through the outbox, so it is not in the
 * Historial.
 *
 * Limit (L13): 5 per hour per person. The repo has no shared rate-limit
 * helper (only route-local maps, e.g. app/api/operating-core/registrations),
 * and no table may be added for it, so this is an in-memory sliding window
 * PER SERVER INSTANCE: on several instances or after a cold start a person
 * could get a few more. Acceptable for a test email to oneself.
 */
import { createElement, type ReactElement } from 'react'

import { TallerAvisoEmail } from '@/emails/taller-aviso'

import { urlAbsoluta } from './avisos-envio'
import { fichaEjemplo, renderAsunto, renderTextoAviso, TEXTOS_PREDETERMINADOS, type DatosAviso, type TipoAvisoEditable } from './avisos-textos'

export const PRUEBAS_POR_HORA = 5
const UNA_HORA_MS = 60 * 60 * 1000

export interface Limitador {
  /** true and counts the attempt when the key is under the limit; false otherwise. */
  intentar(clave: string): boolean
  reiniciar(): void
}

export function crearLimitador(maximo: number, ventanaMs: number, ahora: () => number = Date.now): Limitador {
  const intentos = new Map<string, number[]>()
  return {
    intentar(clave) {
      const momento = ahora()
      const recientes = (intentos.get(clave) ?? []).filter((t) => momento - t < ventanaMs)
      if (recientes.length >= maximo) {
        intentos.set(clave, recientes)
        return false
      }
      recientes.push(momento)
      intentos.set(clave, recientes)
      return true
    },
    reiniciar() {
      intentos.clear()
    },
  }
}

const limitadorPruebas = crearLimitador(PRUEBAS_POR_HORA, UNA_HORA_MS)

/** Counts one test email of this person; false when they already sent 5 in the last hour. */
export function intentarPrueba(personaId: string): boolean {
  return limitadorPruebas.intentar(personaId)
}

/** Tests only. */
export function reiniciarLimitePruebas(): void {
  limitadorPruebas.reiniciar()
}

export interface CorreoPrueba {
  readonly subject: string
  readonly template: ReactElement
}

/** The test email of a draft, rendered with `datos` (sample data). */
export function correoPruebaAviso(input: {
  readonly tipo: TipoAvisoEditable
  readonly asunto: string
  readonly mensaje: string
  readonly datos: DatosAviso
  readonly tallerNombre: string
  readonly urlBase: string
}): CorreoPrueba {
  const plantilla = TEXTOS_PREDETERMINADOS[input.tipo]
  return {
    subject: `Prueba · ${renderAsunto(input.asunto, input.datos)}`,
    template: createElement(TallerAvisoEmail, {
      nombre: input.datos.nombre ?? '',
      titulo: plantilla.titulo,
      cuerpo: renderTextoAviso(input.mensaje, input.datos),
      filas: fichaEjemplo(plantilla, input.datos),
      url: plantilla.cta ? urlAbsoluta('/talleres/mi-recorrido', input.urlBase) : null,
      cta: plantilla.cta,
      tallerNombre: input.tallerNombre,
    }),
  }
}

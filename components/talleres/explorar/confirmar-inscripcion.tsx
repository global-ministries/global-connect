'use client'

/**
 * R3a (odd/tasks/talleres-rediseno.md, S1 S2; design/talleres-interior/20
 * #confirmar #parejas and 21) — the confirmation of an Explorar inscripción:
 * a bottom sheet on phones and the side panel from md (DetalleResponsivo).
 * It sums up the edición (date, hora, lugar), shows «Tus datos» from the
 * ficha and says honestly what happens next: a taller with inscripción
 * automática confirms the place at once, any other waits for the
 * coordinación.
 *
 * Parejas keeps the existing flow (odd/tasks/talleres-inscripcion-en-pareja.md
 * P2): «Elegir a mi pareja» closes this panel and the parent opens the
 * partner picker (components/talleres/selector-pareja.tsx), which enrolls.
 */

import type { ReactElement } from 'react'

import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import { DetalleResponsivo } from '@/components/ui/detalle-responsivo'
import { BotonSistema } from '@/components/ui/sistema-diseno'
import type { PersonaExplorar } from '@/lib/platform/talleres/explorar'

import { diaYHora, fechaLarga, primeraClaseVisible, textoClases, type TallerExplorarFila } from './modelo'

interface Props {
  /** The edición being confirmed; null keeps the panel closed. */
  readonly fila: TallerExplorarFila | null
  readonly persona: PersonaExplorar | null
  readonly enviando: boolean
  /** The action's message when it refused; shown inside the panel. */
  readonly error: string | null
  readonly onCerrar: () => void
  /** Individual: enroll. Pareja: go on to the partner picker. */
  readonly onConfirmar: () => void
}

export const TITULO_CONFIRMAR = 'Confirmar inscripción'
export const TITULO_PAREJA = 'Inscribirse en pareja'

function Resumen({ fila }: { fila: TallerExplorarFila }): ReactElement {
  const primera = fechaLarga(primeraClaseVisible(fila))
  const { dia, hora } = diaYHora(fila)
  const clases = textoClases(fila.clases)
  const cuando = [primera ? `Empieza el ${primera}` : null, hora ? [dia, hora].filter(Boolean).join(' ') : null, clases]
    .filter(Boolean)
    .join(' · ')
  return (
    <div className="rounded-xl bg-secondary px-3.5 py-3">
      <p className="text-base font-semibold text-foreground">
        {fila.nombre} · {fila.edicion}
      </p>
      {cuando && <p className="mt-0.5 text-sm text-muted-foreground">{cuando}</p>}
      {fila.lugar && <p className="mt-0.5 text-sm text-muted-foreground">{fila.lugar}</p>}
    </div>
  )
}

function TusDatos({ persona }: { persona: PersonaExplorar }): ReactElement {
  const filas: [string, string, boolean][] = [
    ['Nombre', persona.nombre ?? '—', false],
    ['Teléfono', persona.telefono ?? '—', true],
    ['Correo', persona.email ?? '—', false],
  ]
  return (
    <div>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Tus datos</h3>
      <dl className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border">
        {filas.map(([etiqueta, valor, mono]) => (
          <div key={etiqueta} className="flex justify-between gap-3 px-3.5 py-2.5 text-sm">
            <dt className="text-muted-foreground">{etiqueta}</dt>
            <dd className={`min-w-0 text-right text-foreground [overflow-wrap:anywhere] ${mono ? 'font-mono tabular-nums' : ''}`}>{valor}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1.5 text-[13px] text-muted-foreground">Son los de tu ficha. Si algo cambió, actualízalo en Mi perfil.</p>
    </div>
  )
}

export function ConfirmarInscripcion({ fila, persona, enviando, error, onCerrar, onConfirmar }: Props): ReactElement {
  const pareja = fila?.tipo === 'pareja'
  const automatica = fila?.inscripcion_automatica === true && !pareja
  const primario = pareja ? 'Elegir a mi pareja' : automatica ? 'Inscribirme' : 'Enviar solicitud'

  return (
    <DetalleResponsivo
      abierto={fila !== null}
      onCambioAbierto={(abierto) => {
        if (!abierto) onCerrar()
      }}
      titulo={pareja ? TITULO_PAREJA : TITULO_CONFIRMAR}
      descripcion={fila ? `${fila.nombre} · ${fila.edicion}` : undefined}
      pie={
        <>
          <BotonSistema type="button" variante="outline" onClick={onCerrar} disabled={enviando}>
            Cancelar
          </BotonSistema>
          <BotonSistema
            type="button"
            cargando={enviando}
            disabled={enviando}
            onClick={onConfirmar}
          >
            {enviando ? 'Enviando…' : primario}
          </BotonSistema>
        </>
      }
    >
      {fila && (
        <div className="grid gap-4">
          <Resumen fila={fila} />
          {pareja && (
            <AvisoFormulario tono="info">
              Se inscriben los dos con una sola solicitud. En el siguiente paso eliges a tu pareja; recibe los mismos avisos que tú.
            </AvisoFormulario>
          )}
          {persona && <TusDatos persona={persona} />}
          <AvisoFormulario tono="info">
            {automatica
              ? 'Tu lugar queda confirmado al inscribirte. Te avisamos por correo y en la app cuando te asignen grupo.'
              : 'La coordinación revisa cada solicitud. Te avisamos por correo y en la app cuando la aprueben.'}
          </AvisoFormulario>
          {error && <AvisoFormulario tono="error">{error}</AvisoFormulario>}
        </div>
      )}
    </DetalleResponsivo>
  )
}

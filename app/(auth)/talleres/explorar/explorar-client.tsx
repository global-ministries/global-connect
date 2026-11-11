"use client"

/**
 * PR20 — Client part of /talleres/explorar (the page is an RSC that loads
 * the rows; this keeps the interaction client-side).
 *
 * Inscripción en pareja (odd/tasks/talleres-inscripcion-en-pareja.md P2) —
 * `talleres_inscribirme` resolves the cohorte server-side; couple ediciones
 * go through the partner picker (components/talleres/selector-pareja.tsx).
 *
 * T9 (odd/tasks/proximo-paso.md, L21–L23) — the confirmation follows the real
 * estado of the viewer's inscripción: the action only returns the inscripción
 * id but revalidates this path, so the rows arrive again with the estado and
 * the toast is derived from them («¡Listo, ya estás inscrito!» or «Recibimos
 * tu inscripción. La coordinación la confirmará.»). Neutral Spanish (tú).
 *
 * R3a (odd/tasks/talleres-rediseno.md, S1 S2 S6 S7; design/talleres-interior/
 * 20 and 21) — v2: one card per taller with its ediciones and the state
 * button (Inscribirme / Ya inscrito|Ya inscrita by the ficha's género /
 * Pendiente / Lleno); «Inscribirme» opens the confirmation in
 * DetalleResponsivo (bottom sheet on phones, side panel on desktop); a
 * couple edición continues to the partner picker. Whoever already did
 * Próximo Paso gets the card to share it (the page drops that taller).
 */

import { useEffect, useRef, useState, type ReactElement } from 'react'
import { BookOpen } from 'lucide-react'

import { CompartirProximoPaso } from '@/components/talleres/explorar/compartir-proximo-paso'
import { ConfirmarInscripcion } from '@/components/talleres/explorar/confirmar-inscripcion'
import { agruparPorTaller, type TallerExplorarFila } from '@/components/talleres/explorar/modelo'
import { TarjetaTallerExplorar } from '@/components/talleres/explorar/tarjeta-taller-explorar'
import { SelectorPareja } from '@/components/talleres/selector-pareja'
import { EstadoVacioSistema } from '@/components/ui/estado-vacio-sistema'
import { TarjetaSistema } from '@/components/ui/sistema-diseno'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { mensajeInscrito, type GeneroFicha, type PersonaExplorar } from '@/lib/platform/talleres/explorar'

import { inscribirseATaller } from './actions'

interface Input {
  readonly talleres: readonly TallerExplorarFila[]
  /** The viewer's ficha: «Tus datos» and «Ya inscrito» / «Ya inscrita». */
  readonly persona?: PersonaExplorar | null
  /** hizo_proximo_paso was true: show the card to share it. */
  readonly proximoPasoHecho?: boolean
}

export const MENSAJE_PENDIENTE = 'Recibimos tu inscripción. La coordinación la confirmará.'
/** When the revalidated rows do not arrive in time. */
export const MENSAJE_RECIBIDA = 'Recibimos tu inscripción.'
/** How long the toast waits for the revalidated rows before the neutral message. */
export const ESPERA_FILAS_MS = 2500

function mensajeInscripcion(fila: TallerExplorarFila, genero: GeneroFicha | null): string {
  if (fila.estado_inscripcion === 'aprobado') return mensajeInscrito(genero)
  if (fila.estado_inscripcion === 'pendiente') return MENSAJE_PENDIENTE
  return MENSAJE_RECIBIDA
}

export function ExplorarTalleresClient({ talleres, persona = null, proximoPasoHecho = false }: Input): ReactElement {
  const notificar = useNotificaciones()
  const genero = persona?.genero ?? null

  const [confirmandoId, setConfirmandoId] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The couple edición whose partner picker is open.
  const [parejaId, setParejaId] = useState<string | null>(null)

  // The edición just enrolled in: its toast waits for the revalidated row.
  const esperando = useRef<string | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filasActuales = useRef(talleres)

  const confirmando = talleres.find((t) => t.id === confirmandoId) ?? null
  const enPareja = talleres.find((t) => t.id === parejaId) ?? null

  function cerrarEspera(): void {
    esperando.current = null
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = null
  }

  /** Toasts the estado once the row says the viewer is in. */
  function avisarSiLlego(filas: readonly TallerExplorarFila[]): boolean {
    const fila = esperando.current ? filas.find((t) => t.id === esperando.current) : undefined
    if (!fila?.ya_inscrito) return false
    cerrarEspera()
    notificar.success(mensajeInscripcion(fila, genero))
    return true
  }

  useEffect(() => {
    filasActuales.current = talleres
    avisarSiLlego(talleres)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only new rows matter
  }, [talleres])

  useEffect(() => cerrarEspera, [])

  function registrarInscripcion(edicionId: string): void {
    cerrarEspera()
    esperando.current = edicionId
    if (avisarSiLlego(filasActuales.current)) return
    temporizador.current = setTimeout(() => {
      if (esperando.current !== edicionId) return
      cerrarEspera()
      notificar.success(MENSAJE_RECIBIDA)
    }, ESPERA_FILAS_MS)
  }

  function abrir(fila: TallerExplorarFila): void {
    setError(null)
    setConfirmandoId(fila.id)
  }

  function cerrar(): void {
    if (enviando) return
    setConfirmandoId(null)
    setError(null)
  }

  async function confirmar(): Promise<void> {
    if (!confirmando) return
    if (confirmando.tipo === 'pareja') {
      setConfirmandoId(null)
      setParejaId(confirmando.id)
      return
    }
    const edicionId = confirmando.id
    setEnviando(true)
    setError(null)
    try {
      const result = await inscribirseATaller({ edicionId, pareja: null })
      if (result.ok) {
        setConfirmandoId(null)
        registrarInscripcion(edicionId)
      } else {
        setError(result.message)
      }
    } catch {
      setError('No se pudo completar la operación. Inténtalo de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  const grupos = agruparPorTaller(talleres)

  return (
    <>
      {grupos.length === 0 && (
        <TarjetaSistema className="p-0">
          <EstadoVacioSistema
            icono={BookOpen}
            titulo="No hay talleres abiertos en este momento."
            subtitulo="Cuando se abra la inscripción de un taller, lo verás aquí."
          />
        </TarjetaSistema>
      )}
      <div className="grid grid-cols-1 items-start gap-3.5 md:grid-cols-[repeat(auto-fill,minmax(min(100%,380px),1fr))] md:gap-4">
        {grupos.map((taller) => (
          <TarjetaTallerExplorar
            key={taller.clave}
            taller={taller}
            genero={genero}
            abierta={confirmandoId}
            onInscribirme={abrir}
          />
        ))}
        {proximoPasoHecho && <CompartirProximoPaso />}
      </div>

      <ConfirmarInscripcion
        fila={confirmando}
        persona={persona}
        enviando={enviando}
        error={error}
        onCerrar={cerrar}
        onConfirmar={() => void confirmar()}
      />

      {enPareja && (
        <SelectorPareja
          key={enPareja.id}
          edicionId={enPareja.id}
          vinculoEdicion={enPareja.link_type}
          momentoEnvioAcceso={enPareja.momento_envio_acceso}
          onCerrar={() => setParejaId(null)}
          onInscrito={() => {
            setParejaId(null)
            registrarInscripcion(enPareja.id)
          }}
        />
      )}
    </>
  )
}

'use client'

/**
 * T8b (odd/tasks/talleres-reserva-publica.md, S17) — the attendance of a
 * cerrada clase on /talleres/[taller]/[edicion]/[grupo] (artboards 16, 17).
 *
 * Replaces LecturaAsistenciaClase for a cerrada clase so a recovered absence
 * reads as «R · Recuperada» with its fecha and who gave it, instead of a
 * plain «Ausente». For whoever may register (the grupo's líder or the
 * coordinación, decided by the page; the RPC re-checks), an ausente row
 * carries «Recuperar clase» (opens RecuperarClasePanel) and a recovered row
 * carries «Anular». Without that permission the rows are read-only.
 *
 * Props are plain JSON: this island is reached from the server page.
 */

import { useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle } from 'lucide-react'

import { BadgeSistema, BotonSistema, TarjetaSistema, TextoSistema, TituloSistema } from '@/components/ui/sistema-diseno'
import { asistenciaEstadoBadgeVariante, asistenciaEstadoLabel } from '@/components/talleres/labels'
import { useNotificaciones } from '@/hooks/use-notificaciones'
import { fechaCorta, hoyIglesia } from '@/lib/platform/talleres/minimo-suspension'
import { anularRecuperacion, registrarRecuperacion } from '@/lib/platform/talleres/recuperar-clase-actions'
import {
  RecuperarClasePanel,
  type DatosRecuperacion,
  type FacilitadorOpcion,
} from '@/components/talleres/recuperar/recuperar-clase-panel.client'

export interface FilaClaseCerrada {
  readonly id: string
  readonly inscripcionId: string
  readonly personaId: string
  readonly nombre: string
  readonly estado: 'presente' | 'ausente' | 'no_aplica'
  readonly motivo: string | null
}

export interface RecuperacionFila {
  readonly id: string
  readonly personaId: string
  /** YYYY-MM-DD */
  readonly fecha: string
  readonly dadaPorNombre: string
  readonly nota: string | null
}

export interface AsistenciaClaseCerradaProps {
  readonly tallerSlug: string
  readonly edicionId: string
  readonly grupoId: string
  readonly sesionId: string
  readonly numero: number
  readonly tema: string | null
  /** YYYY-MM-DD: when the clase was held (fecha_realizada, else programada). */
  readonly fechaClase: string
  readonly filas: readonly FilaClaseCerrada[]
  readonly recuperaciones: readonly RecuperacionFila[]
  readonly puedeRecuperar: boolean
  readonly facilitadores: readonly FacilitadorOpcion[]
  readonly dadaPorDefecto: string | null
  /** YYYY-MM-DD; defaults to today in the church's time zone. */
  readonly hoy?: string
}

export function AsistenciaClaseCerrada({
  tallerSlug,
  edicionId,
  grupoId,
  sesionId,
  numero,
  tema,
  fechaClase,
  filas,
  recuperaciones,
  puedeRecuperar,
  facilitadores,
  dadaPorDefecto,
  hoy,
}: AsistenciaClaseCerradaProps): ReactElement {
  const router = useRouter()
  const notificar = useNotificaciones()
  const [abierta, setAbierta] = useState<FilaClaseCerrada | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [anulando, setAnulando] = useState<string | null>(null)

  const ruta = { tallerSlug, edicionId, grupoId }
  const titulo = tema ? `Clase ${numero} · ${tema}` : `Clase ${numero}`
  const hoyIso = hoy ?? hoyIglesia()
  const recuperacionDe = new Map(recuperaciones.map((r) => [r.personaId, r]))

  const recuperadas = filas.filter((f) => f.estado === 'ausente' && recuperacionDe.has(f.personaId)).length
  const presentes = filas.filter((f) => f.estado === 'presente').length
  const ausentes = filas.filter((f) => f.estado === 'ausente').length - recuperadas

  function abrir(fila: FilaClaseCerrada): void {
    setError(null)
    setAbierta(fila)
  }

  async function registrar(datos: DatosRecuperacion): Promise<void> {
    if (!abierta || enviando) return
    setEnviando(true)
    setError(null)
    try {
      const r = await registrarRecuperacion({ ...ruta, sesionId, personaId: abierta.personaId, ...datos })
      if (!r.ok) {
        setError(r.message)
        return
      }
      notificar.success(`Clase ${numero} recuperada por ${abierta.nombre}. Cuenta para su certificado.`)
      setAbierta(null)
      router.refresh()
    } finally {
      setEnviando(false)
    }
  }

  async function anular(fila: FilaClaseCerrada, recuperacionId: string): Promise<void> {
    if (anulando) return
    setAnulando(recuperacionId)
    try {
      const r = await anularRecuperacion({ ...ruta, recuperacionId })
      if (!r.ok) {
        notificar.error(r.message)
        return
      }
      notificar.success(`Se anuló la recuperación de ${fila.nombre}.`)
      router.refresh()
    } finally {
      setAnulando(null)
    }
  }

  return (
    <section aria-label={titulo}>
      <TituloSistema nivel={3} className="mb-1">
        {titulo}
      </TituloSistema>
      <TextoSistema variante="sutil" tamaño="sm" className="mb-3 block font-mono tabular-nums">
        {`Presentes ${presentes} · Recuperadas ${recuperadas} · Ausentes ${ausentes}`}
      </TextoSistema>

      <TarjetaSistema className="p-0">
        <ul className="divide-y divide-border">
          {filas.map((fila) => {
            const recuperacion = fila.estado === 'ausente' ? recuperacionDe.get(fila.personaId) : undefined
            return (
              <li key={fila.id} aria-label={fila.nombre} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{fila.nombre}</div>
                  {recuperacion ? (
                    <TextoSistema variante="sutil" tamaño="sm" className="mt-1 block">
                      {`Recuperada el ${fechaCorta(recuperacion.fecha)} con ${recuperacion.dadaPorNombre}`}
                    </TextoSistema>
                  ) : (
                    fila.estado === 'ausente' &&
                    fila.motivo && (
                      <div className="mt-1 flex items-start gap-1.5">
                        <AlertCircle aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                        <TextoSistema variante="sutil" tamaño="sm" className="min-w-0">
                          {fila.motivo}
                        </TextoSistema>
                      </div>
                    )
                  )}
                </div>

                {recuperacion ? (
                  <BadgeSistema variante="info" tamaño="sm">
                    <span aria-hidden="true" className="mr-1 font-mono font-semibold">
                      R
                    </span>
                    <span>Recuperada</span>
                  </BadgeSistema>
                ) : (
                  <BadgeSistema variante={asistenciaEstadoBadgeVariante(fila.estado)} tamaño="sm">
                    {asistenciaEstadoLabel(fila.estado)}
                  </BadgeSistema>
                )}

                {puedeRecuperar && fila.estado === 'ausente' && !recuperacion && (
                  <BotonSistema
                    variante="outline"
                    tamaño="sm"
                    aria-label={`Recuperar clase de ${fila.nombre}`}
                    onClick={() => abrir(fila)}
                  >
                    Recuperar clase
                  </BotonSistema>
                )}
                {puedeRecuperar && recuperacion && (
                  <BotonSistema
                    variante="ghost"
                    tamaño="sm"
                    aria-label={`Anular la recuperación de ${fila.nombre}`}
                    cargando={anulando === recuperacion.id}
                    disabled={anulando !== null}
                    onClick={() => {
                      void anular(fila, recuperacion.id)
                    }}
                  >
                    Anular
                  </BotonSistema>
                )}
              </li>
            )
          })}
        </ul>
      </TarjetaSistema>

      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
        <BadgeSistema variante="info" tamaño="sm">
          <span aria-hidden="true" className="font-mono font-semibold">
            R
          </span>
        </BadgeSistema>
        <span>Recuperada aparte (cuenta como asistida)</span>
      </div>

      {abierta && (
        <RecuperarClasePanel
          key={abierta.id}
          abierto
          onCambioAbierto={(abierto) => {
            if (!abierto) setAbierta(null)
          }}
          personaNombre={abierta.nombre}
          claseTexto={`${titulo} · ${fechaCorta(fechaClase)}`}
          fechaMinima={fechaClase}
          hoy={hoyIso}
          facilitadores={facilitadores}
          dadaPorDefecto={dadaPorDefecto}
          enviando={enviando}
          error={error}
          onRegistrar={(datos) => {
            void registrar(datos)
          }}
        />
      )}
    </section>
  )
}

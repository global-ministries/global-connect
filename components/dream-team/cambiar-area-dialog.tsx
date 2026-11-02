'use client'

/**
 * "Cambiar de área" of one servicio (odd/tasks/dream-team-cambiar-area.md, T2,
 * S3 and S5), opened from the servicio card of the person panel in Servidores
 * and Mi equipo.
 *
 * Loads the destinations from GET /api/dream-team/servicios/[id]/cambiar-area
 * when it opens and shows them in the tree-aware picker of "Asignar servicio"
 * (SelectorEquipo). The rol starts at the one with the current rol's nivel
 * when the destination has it; the motivo (Corrección / Traslado) is required,
 * the nota optional. Where the viewer directs the destination (`dirige`) the
 * action is "Cambiar de área" and the move happens in one step; elsewhere it
 * is "Enviar solicitud" and a director of both áreas approves it. The
 * database decides; its Spanish message is shown in the dialog.
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema, SelectSistema, TextareaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import { AvisoFormulario } from '@/components/forms/aviso-formulario'
import type { useNotificaciones } from '@/hooks/use-notificaciones'
import { rolLabel } from '@/components/dream-team/labels'
import { SelectorEquipo } from '@/components/dream-team/asignador/selector-equipo'
import {
  MOTIVOS_CAMBIO_AREA,
  NOTA_CAMBIO_AREA_MAX,
  rolInicial,
  type DestinoCambioArea,
  type MotivoCambioArea,
} from '@/lib/platform/dream-team/cambiar-area'
import type { DreamTeamNivelRol } from '@/lib/platform/dream-team/types'

export interface CambiarAreaDialogProps {
  readonly servicioId: string
  readonly nombre: string
  /** The current área, as the card shows it. */
  readonly equipoActual: string
  readonly abierto: boolean
  readonly onAbiertoChange: (abierto: boolean) => void
  /** After a move or a sent request: refresh the server data. */
  readonly onGuardado: () => void
  readonly toast: Pick<ReturnType<typeof useNotificaciones>, 'success'>
}

type Carga =
  | { readonly estado: 'cargando' }
  | { readonly estado: 'error'; readonly mensaje: string }
  | { readonly estado: 'listo'; readonly destinos: readonly DestinoCambioArea[]; readonly nivelActual: DreamTeamNivelRol | null }

async function mensajeDe(respuesta: Response, porDefecto: string): Promise<string> {
  try {
    const cuerpo = (await respuesta.json()) as { error?: string }
    return cuerpo.error ?? porDefecto
  } catch {
    return porDefecto
  }
}

export function CambiarAreaDialog({
  servicioId,
  nombre,
  equipoActual,
  abierto,
  onAbiertoChange,
  onGuardado,
  toast,
}: CambiarAreaDialogProps): ReactElement {
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' })
  const [equipoId, setEquipoId] = useState('')
  const [rolId, setRolId] = useState('')
  const [motivo, setMotivo] = useState<MotivoCambioArea | ''>('')
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const url = `/api/dream-team/servicios/${encodeURIComponent(servicioId)}/cambiar-area`

  useEffect(() => {
    if (!abierto) return
    let vigente = true
    setCarga({ estado: 'cargando' })
    setError(null)
    void (async () => {
      try {
        const respuesta = await fetch(url, { cache: 'no-store' })
        if (!respuesta.ok) throw new Error(await mensajeDe(respuesta, 'No se pudieron cargar las áreas.'))
        const cuerpo = (await respuesta.json()) as { destinos: DestinoCambioArea[]; nivelActual: DreamTeamNivelRol | null }
        if (vigente) setCarga({ estado: 'listo', destinos: cuerpo.destinos, nivelActual: cuerpo.nivelActual })
      } catch (causa) {
        if (vigente) setCarga({ estado: 'error', mensaje: causa instanceof Error ? causa.message : 'No se pudieron cargar las áreas.' })
      }
    })()
    return () => {
      vigente = false
    }
  }, [abierto, url])

  const destinos = useMemo(() => (carga.estado === 'listo' ? carga.destinos : []), [carga])
  const destino = destinos.find((d) => d.equipoId === equipoId)
  const equipos = useMemo(() => destinos.map((d) => ({ id: d.equipoId, ruta: d.ruta })), [destinos])
  const listo = destino !== undefined && rolId !== '' && motivo !== ''

  function elegirEquipo(id: string): void {
    if (id === equipoId) return
    setEquipoId(id)
    setRolId(rolInicial(destinos.find((d) => d.equipoId === id), carga.estado === 'listo' ? carga.nivelActual : null))
    setError(null)
  }

  async function enviar(): Promise<void> {
    if (!destino || !listo || enviando) return
    setEnviando(true)
    setError(null)
    try {
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modo: destino.dirige ? 'directo' : 'solicitud',
          equipoId: destino.equipoId,
          rolId,
          motivo,
          nota: nota.trim() || null,
        }),
      })
      if (!respuesta.ok) {
        setError(await mensajeDe(respuesta, 'No se pudo cambiar el área.'))
        return
      }
      toast.success(
        destino.dirige
          ? `${nombre} pasó a ${destino.ruta[destino.ruta.length - 1] ?? 'la nueva área'}.`
          : 'Solicitud enviada. Un director de ambas áreas la va a revisar.',
      )
      onGuardado()
      onAbiertoChange(false)
    } catch {
      setError('No se pudo cambiar el área.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(open) => !enviando && onAbiertoChange(open)}>
      {/* Long área lists scroll inside the dialog instead of past the viewport. */}
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>Cambiar de área</DialogTitle>
          <DialogDescription>
            Mueve a {nombre} desde {equipoActual}. Conserva su etapa; sus asistencias pasadas quedan donde ocurrieron.
          </DialogDescription>
        </DialogHeader>

        {carga.estado === 'cargando' && <TextoSistema variante="sutil">Cargando áreas…</TextoSistema>}
        {carga.estado === 'error' && (
          <TextoSistema role="alert" tamaño="sm" className="text-danger-text">
            {carga.mensaje}
          </TextoSistema>
        )}
        {carga.estado === 'listo' && (
          <div className="grid gap-4">
            <SelectorEquipo equipos={equipos} valor={equipoId} onCambio={elegirEquipo} />
            {destino && !destino.dirige && (
              <AvisoFormulario tono="info">
                No diriges esta área: se enviará una solicitud para que la apruebe un director de ambas áreas.
              </AvisoFormulario>
            )}
            <SelectSistema
              label="Rol"
              opciones={(destino?.roles ?? []).map((r) => ({ valor: r.id, etiqueta: rolLabel(r.label) }))}
              placeholder={
                !destino ? 'Elige primero un área' : destino.roles.length === 0 ? 'Esta área no tiene roles activos' : 'Elige un rol'
              }
              value={rolId}
              onValueChange={setRolId}
              disabled={!destino || destino.roles.length === 0 || enviando}
            />
            <SelectSistema
              label="Motivo"
              opciones={MOTIVOS_CAMBIO_AREA.map((m) => ({ valor: m.valor, etiqueta: m.etiqueta }))}
              placeholder="Elige un motivo"
              value={motivo}
              onValueChange={(v) => setMotivo(v as MotivoCambioArea)}
              disabled={enviando}
            />
            <TextareaSistema
              label="Nota (opcional)"
              filas={2}
              maxLength={NOTA_CAMBIO_AREA_MAX}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              disabled={enviando}
            />
          </div>
        )}

        {error && (
          <TextoSistema role="alert" tamaño="sm" className="text-danger-text">
            {error}
          </TextoSistema>
        )}

        <DialogFooter>
          <BotonSistema type="button" variante="outline" disabled={enviando} onClick={() => onAbiertoChange(false)}>
            Cancelar
          </BotonSistema>
          <BotonSistema
            type="button"
            disabled={!listo || enviando}
            cargando={enviando}
            onClick={() => {
              void enviar()
            }}
          >
            {destino && !destino.dirige ? 'Enviar solicitud' : 'Cambiar de área'}
          </BotonSistema>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

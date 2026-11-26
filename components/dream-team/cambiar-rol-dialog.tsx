'use client'

/**
 * «Cambiar rol» of one servicio inside its own equipo
 * (odd/tasks/dream-team-cambiar-rol.md, T1, S1–S3), opened from the servicio
 * card of the person panel in Servidores and Mi equipo, next to «Cambiar de
 * área» and under the same condition.
 *
 * Loads the roles from GET /api/dream-team/servicios/[id]/cambiar-rol when it
 * opens, shows the current one and offers only the ones the server marked
 * `asignable` (a coordinator only sees voluntario and líder roles: T3, S7). «Guardar»
 * changes it at once (no request step); the nota is optional. The database
 * decides; the route's plain-Spanish message is shown in the dialog — also
 * when opening is refused (one's own servicio, or a coordinator's or
 * director's servicio for a coordinator: T2, S6).
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BotonSistema, SelectSistema, TextareaSistema, TextoSistema } from '@/components/ui/sistema-diseno'
import type { useNotificaciones } from '@/hooks/use-notificaciones'
import { rolLabel } from '@/components/dream-team/labels'
import { NOTA_CAMBIO_ROL_MAX, type RolCambiable } from '@/lib/platform/dream-team/cambiar-rol'

export interface CambiarRolDialogProps {
  readonly servicioId: string
  readonly nombre: string
  /** The servicio's área, as the card shows it. */
  readonly equipoActual: string
  readonly abierto: boolean
  readonly onAbiertoChange: (abierto: boolean) => void
  /** After the change: refresh the server data. */
  readonly onGuardado: () => void
  readonly toast: Pick<ReturnType<typeof useNotificaciones>, 'success'>
}

type Carga =
  | { readonly estado: 'cargando' }
  | { readonly estado: 'error'; readonly mensaje: string }
  | { readonly estado: 'listo'; readonly roles: readonly RolCambiable[] }

async function mensajeDe(respuesta: Response, porDefecto: string): Promise<string> {
  try {
    const cuerpo = (await respuesta.json()) as { error?: string }
    return cuerpo.error ?? porDefecto
  } catch {
    return porDefecto
  }
}

export function CambiarRolDialog({
  servicioId,
  nombre,
  equipoActual,
  abierto,
  onAbiertoChange,
  onGuardado,
  toast,
}: CambiarRolDialogProps): ReactElement {
  const [carga, setCarga] = useState<Carga>({ estado: 'cargando' })
  const [rolId, setRolId] = useState('')
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const url = `/api/dream-team/servicios/${encodeURIComponent(servicioId)}/cambiar-rol`

  useEffect(() => {
    if (!abierto) return
    let vigente = true
    setCarga({ estado: 'cargando' })
    setRolId('')
    setError(null)
    void (async () => {
      try {
        const respuesta = await fetch(url, { cache: 'no-store' })
        if (!respuesta.ok) throw new Error(await mensajeDe(respuesta, 'No se pudieron cargar los roles.'))
        const cuerpo = (await respuesta.json()) as { roles: RolCambiable[] }
        if (vigente) setCarga({ estado: 'listo', roles: cuerpo.roles })
      } catch (causa) {
        if (vigente) setCarga({ estado: 'error', mensaje: causa instanceof Error ? causa.message : 'No se pudieron cargar los roles.' })
      }
    })()
    return () => {
      vigente = false
    }
  }, [abierto, url])

  const roles = useMemo(() => (carga.estado === 'listo' ? carga.roles : []), [carga])
  const actual = roles.find((r) => r.actual)
  const opciones = roles.filter((r) => r.asignable)
  const listo = carga.estado === 'listo' && opciones.some((r) => r.id === rolId)

  async function guardar(): Promise<void> {
    if (!listo || enviando) return
    setEnviando(true)
    setError(null)
    try {
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rolId, nota: nota.trim() || null }),
      })
      if (!respuesta.ok) {
        setError(await mensajeDe(respuesta, 'No se pudo cambiar el rol.'))
        return
      }
      toast.success('Rol actualizado')
      onGuardado()
      onAbiertoChange(false)
    } catch {
      setError('No se pudo cambiar el rol.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(open) => !enviando && onAbiertoChange(open)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>Cambiar rol</DialogTitle>
          <DialogDescription>
            Cambia el rol de {nombre} en {equipoActual}. Sigue en la misma área, con su etapa y sus turnos.
          </DialogDescription>
        </DialogHeader>

        {carga.estado === 'cargando' && <TextoSistema variante="sutil">Cargando roles…</TextoSistema>}
        {carga.estado === 'error' && (
          <TextoSistema role="alert" tamaño="sm" className="text-danger-text">
            {carga.mensaje}
          </TextoSistema>
        )}
        {carga.estado === 'listo' && (
          <div className="grid gap-4">
            {actual && <TextoSistema tamaño="sm">{`Rol actual: ${rolLabel(actual.label)}`}</TextoSistema>}
            <SelectSistema
              label="Rol nuevo"
              opciones={opciones.map((r) => ({ valor: r.id, etiqueta: rolLabel(r.label) }))}
              placeholder={opciones.length === 0 ? 'No hay otro rol disponible en esta área' : 'Elige el rol nuevo'}
              value={rolId}
              onValueChange={setRolId}
              disabled={opciones.length === 0 || enviando}
            />
            <TextareaSistema
              label="Nota (opcional)"
              filas={2}
              maxLength={NOTA_CAMBIO_ROL_MAX}
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
              void guardar()
            }}
          >
            Guardar
          </BotonSistema>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
